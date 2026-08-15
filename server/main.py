"""FastAPI app — the only process that runs on demo day.

Serves the built frontend from web/dist AND the JSON API on one port:
    uvicorn server.main:app --port 8000

MOCK mode (default) returns contract-shaped responses without a model, so the
frontend lane is unblocked from hour one. Flip with NPN_MOCK=0 once weights exist.
Mock predictions are deterministic in the image digest — same image, same answer,
every run. That is also what makes the demo reproducible.
"""

from __future__ import annotations

import os
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import bands, store

MOCK = os.getenv("NPN_MOCK", "1") == "1"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
CONTRACT_VERSION = "1.0.0"

@asynccontextmanager
async def lifespan(_: FastAPI):
    store.init()
    yield


app = FastAPI(title="Age Verification Service", version=CONTRACT_VERSION,
              lifespan=lifespan)

# Vite dev server only. Not a wildcard — the demo runs same-origin off dist/.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# --- public-exposure guard -------------------------------------------------
# Off by default: on the demo laptop, same-origin and offline, this is unnecessary.
# Set NPN_PUBLIC=1 before putting the service behind a tunnel. Prediction runs a GPU
# model, so an unthrottled public endpoint is both a cost and an availability problem,
# and this is a biometric service — uploads from strangers are exactly what we do not
# want to be accepting silently.
PUBLIC = os.getenv("NPN_PUBLIC", "0") == "1"
RATE_LIMIT_PER_MIN = int(os.getenv("NPN_RATE_LIMIT", "12"))
_hits: dict[str, list[float]] = defaultdict(list)


@app.middleware("http")
async def throttle(request: Request, call_next):
    if PUBLIC and request.url.path == "/api/predict":
        ip = (request.headers.get("cf-connecting-ip")
              or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
              or (request.client.host if request.client else "unknown"))
        now = time.time()
        recent = [t for t in _hits[ip] if now - t < 60]
        if len(recent) >= RATE_LIMIT_PER_MIN:
            recent.append(now)
            _hits[ip] = recent
            return JSONResponse(
                {"detail": f"rate limit: {RATE_LIMIT_PER_MIN} predictions per minute"},
                status_code=429)
        recent.append(now)
        _hits[ip] = recent
    return await call_next(request)


_predictor = None  # lazily loaded real model; stays None in MOCK


# --- model plumbing --------------------------------------------------------

def _load_predictor():
    """Real model. Imported lazily so the server boots with no torch installed."""
    global _predictor
    if _predictor is None:
        from ml.predict import Predictor  # noqa: PLC0415 - lazy by design
        _predictor = Predictor()
    return _predictor


def _mock_predict(digest: str) -> dict:
    """Deterministic pseudo-prediction derived from the image digest.

    Reserves two digest prefixes for the failure states so the frontend can exercise
    every branch of the contract without a model: any image whose digest starts with
    '0' -> no_face, '1' -> low_quality.
    """
    if digest.startswith("0"):
        return {"status": "no_face"}
    if digest.startswith("1"):
        return {"status": "low_quality", "quality_reason": "face region below 64px"}

    seed = int(digest[:8], 16)
    age = 18.0 + (seed % 5200) / 100.0          # 18.00 - 69.99
    spread = 2.5 + (seed >> 8 & 0xFF) / 64.0     # 2.5 - 6.5
    pct = ((seed >> 16 & 0xFFFF) % 1000) / 1000.0
    conf = 0.30 + pct * 0.65
    return {
        "status": "ok",
        "age_estimate": round(age, 1),
        "age_interval": [round(age - spread, 1), round(age + spread, 1)],
        "confidence": round(conf, 3),
        "confidence_percentile": round(pct, 3),
        "face_box": [64, 48, 192, 192],
    }


def _model_meta() -> dict:
    if MOCK:
        return {"name": "mock", "version": "0.0.0-mock", "head": "dist_bins"}
    try:
        return _load_predictor().meta()
    except Exception as exc:  # noqa: BLE001 - never let model loading blank the console
        return {"name": "unavailable", "version": "-", "head": "-", "error": str(exc)[:200]}


# --- endpoints -------------------------------------------------------------

@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "mock": MOCK, "model_loaded": _predictor is not None,
            "contract": CONTRACT_VERSION}


@app.get("/api/meta")
def meta() -> dict:
    metrics = {"mae": None, "cs5": None, "band_accuracy": None, "baseline_mae": None}
    calibration: list[dict] = []
    evidence: dict = {}
    if not MOCK:
        # Bands and policy must render even if the model cannot load. A 500 here means a
        # blank console in front of the panel; missing metrics only means empty cells,
        # which the UI already renders as "not measured".
        try:
            p = _load_predictor()
            metrics, calibration, evidence = p.metrics(), p.calibration(), p.evidence()
        except Exception:  # noqa: BLE001
            pass
    return {
        "model": _model_meta(),
        "bands": bands.bands(),
        "policy": bands.POLICIES["trial_eligibility_v1"],
        "review_percentile": bands.REVIEW_PERCENTILE,
        "metrics": metrics,
        "calibration": calibration,
        "evidence": evidence,
        "mock": MOCK,
        "public": PUBLIC,
    }


@app.post("/api/predict")
async def predict(
    file: UploadFile = File(...),
    policy: str = Form("trial_eligibility_v1"),
) -> JSONResponse:
    if policy not in bands.POLICIES:
        raise HTTPException(400, f"unknown policy '{policy}'")
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(415, f"unsupported content type '{file.content_type}'")

    data = await file.read()
    if not data:
        raise HTTPException(400, "empty upload")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "image exceeds 10 MB")

    request_id = str(uuid.uuid4())
    digest = store.hash_image(data)      # bytes end here; nothing downstream sees them
    t0 = time.perf_counter()

    try:
        raw = _mock_predict(digest) if MOCK else _load_predictor().predict(data)
    except Exception as exc:  # noqa: BLE001 - any model failure becomes a contract response
        store.log(request_id, "predict_error", str(exc)[:200], image_sha256=digest)
        return JSONResponse(_envelope(request_id, {"status": "error"}, policy, 0.0,
                                      error=str(exc)[:200]))
    finally:
        del data

    latency_ms = round((time.perf_counter() - t0) * 1000, 1)
    body = _envelope(request_id, raw, policy, latency_ms)

    detail = (f"age={body['age_estimate']} band={body['band']['id'] if body['band'] else None} "
              f"outcome={body['decision']['outcome']} status={body['status']}")
    store.log(request_id, "predict", detail, image_sha256=digest)

    if body["review_required"]:
        store.enqueue(request_id, body["age_estimate"], body["confidence"],
                      body["confidence_percentile"], body["band"],
                      body["decision"]["rule"])

    return JSONResponse(body)


def _envelope(request_id: str, raw: dict, policy: str, latency_ms: float,
              error: str | None = None) -> dict:
    """Single place the contract envelope is constructed. Every status goes through here."""
    status = raw.get("status", "error")
    base = {
        "request_id": request_id,
        "status": status,
        "age_estimate": None,
        "age_interval": None,
        "confidence": None,
        "confidence_percentile": None,
        "band": None,
        "decision": bands.indeterminate(policy),
        "review_required": True,
        "face_box": raw.get("face_box"),
        "model": _model_meta(),
        "latency_ms": latency_ms,
        "contract": CONTRACT_VERSION,
    }
    if error:
        base["error"] = error
    if raw.get("quality_reason"):
        base["quality_reason"] = raw["quality_reason"]

    if status != "ok":
        return base

    age = float(raw["age_estimate"])
    interval = tuple(raw["age_interval"])
    pct = float(raw["confidence_percentile"])
    decision = bands.decide(age, interval, pct, policy)
    base.update(
        age_estimate=age,
        age_interval=list(interval),
        confidence=float(raw["confidence"]),
        confidence_percentile=pct,
        band=bands.band_for(age),
        decision=decision,
        review_required=decision["outcome"] == "review",
    )
    return base


@app.get("/api/review-queue")
def review_queue(include_resolved: bool = False) -> dict:
    items = store.queue(include_resolved=include_resolved)
    return {"items": items, "count": len(items)}


class ResolveBody(BaseModel):
    reviewer: str
    verdict: str
    override_age: float | None = None


@app.post("/api/review-queue/{request_id}/resolve")
def resolve_review(request_id: str, body: ResolveBody) -> dict:
    try:
        item = store.resolve(request_id, body.reviewer, body.verdict, body.override_age)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if item is None:
        raise HTTPException(404, "no open review item with that request_id")
    return item


@app.get("/api/audit")
def audit(limit: int = 50) -> dict:
    items = store.audit(limit=max(1, min(limit, 500)))
    return {"items": items, "count": len(items)}


# --- static frontend (mounted last so /api/* always wins) ------------------

if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str) -> FileResponse:
        candidate = DIST / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
