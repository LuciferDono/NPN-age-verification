"""One runnable check for the whole contract surface.

    .venv/Scripts/python.exe tests/test_api.py

Asserts against contract/predict.contract.md, not against the implementation — if the
envelope shape drifts, this fails and the frontend lane finds out immediately rather
than at integration on day 2.
"""

from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from server import bands, store  # noqa: E402

# Isolate the test DB before the app touches it.
store.DB_PATH = Path(__file__).with_name("_test.db")
store.DB_PATH.unlink(missing_ok=True)

from server.main import app  # noqa: E402

client = TestClient(app)

ENVELOPE_KEYS = {
    "request_id", "status", "age_estimate", "age_interval", "confidence",
    "confidence_percentile", "band", "decision", "review_required", "face_box",
    "model", "latency_ms", "contract",
}


MOCK = os.getenv("NPN_MOCK", "1") == "1"

SAMPLES = Path(__file__).resolve().parent.parent / "data/age_prediction_up/age_prediction/test"


def image_with_digest_prefix(prefix: str) -> bytes:
    """Mock mode branches on the image digest; brute-force a matching payload."""
    for n in range(100_000):
        data = b"npn-test-%d" % n
        if hashlib.sha256(data).hexdigest().startswith(prefix):
            return data
    raise AssertionError(f"no payload found for prefix {prefix!r}")


def sample_image() -> bytes:
    """A real held-out face, for the tests that need the model to actually predict."""
    for folder in ("030", "025", "040"):
        d = SAMPLES / folder
        if d.is_dir():
            for p in sorted(d.iterdir()):
                if p.suffix.lower() in {".jpg", ".jpeg", ".png"}:
                    return p.read_bytes()
    raise AssertionError(f"no sample image under {SAMPLES} — is the dataset extracted?")


def post(data: bytes, policy: str = "trial_eligibility_v1"):
    return client.post(
        "/api/predict",
        files={"file": ("f.jpg", data, "image/jpeg")},
        data={"policy": policy},
    )


def test_health_and_meta() -> None:
    h = client.get("/api/health").json()
    assert h["ok"] is True
    assert h["mock"] is MOCK

    m = client.get("/api/meta").json()
    assert m["mock"] is MOCK, "the UI badge must reflect the real mode"
    assert m["bands"] == bands.bands()
    assert m["review_percentile"] == bands.REVIEW_PERCENTILE
    assert set(m["metrics"]) >= {"mae", "cs5", "band_accuracy", "baseline_mae"}

    if MOCK:
        assert all(m["metrics"][k] is None for k in
                   ("mae", "cs5", "band_accuracy", "baseline_mae")), \
            "mock mode must never publish metrics"
    else:
        # Real mode: the numbers are measured, and must beat the null model or the
        # decision path is built on something worse than guessing the mean age.
        assert m["metrics"]["mae"] < m["metrics"]["baseline_mae"], m["metrics"]
        assert m["calibration"], "calibration table must ship with the model"


def test_predict_ok_envelope() -> None:
    data = sample_image() if not MOCK else image_with_digest_prefix("a")
    r = post(data)
    assert r.status_code == 200
    b = r.json()
    assert set(b) >= ENVELOPE_KEYS, f"missing: {ENVELOPE_KEYS - set(b)}"
    assert b["status"] == "ok", b
    assert 1.0 <= b["age_estimate"] <= 100.0
    lo, hi = b["age_interval"]
    assert lo < b["age_estimate"] < hi, "interval must bracket the estimate"
    assert b["band"] == bands.band_for(b["age_estimate"])
    assert b["decision"]["outcome"] in {"verified", "review", "rejected"}
    assert b["review_required"] == (b["decision"]["outcome"] == "review")
    assert b["contract"] == "1.0.0"


def test_determinism() -> None:
    data = sample_image() if not MOCK else image_with_digest_prefix("b")
    a, b = post(data).json(), post(data).json()
    assert a["age_estimate"] == b["age_estimate"], "same image must give same answer"
    assert a["request_id"] != b["request_id"], "but a fresh request_id each time"


def test_failure_states_share_the_envelope() -> None:
    """Every non-ok status returns the same envelope with the same fields nulled.

    In mock mode two digest prefixes are reserved as fixtures. Against the real model
    the natural equivalent is bytes that are not a decodable image, which is the
    failure a user actually produces.
    """
    cases = ([("0", "no_face"), ("1", "low_quality")] if MOCK
             else [(None, "low_quality")])

    for prefix, expected in cases:
        payload = image_with_digest_prefix(prefix) if prefix else b"not-an-image" * 64
        b = post(payload).json()
        assert b["status"] == expected, b["status"]
        assert set(b) >= ENVELOPE_KEYS
        for null_field in ("age_estimate", "age_interval", "confidence",
                           "confidence_percentile", "band"):
            assert b[null_field] is None, f"{expected}.{null_field} must be null"
        assert b["decision"]["outcome"] == "indeterminate"
        assert b["review_required"] is True, "an unusable image must never auto-action"


def test_upload_guards() -> None:
    assert client.post("/api/predict",
                       files={"file": ("f.txt", b"x", "text/plain")}).status_code == 415
    assert client.post("/api/predict",
                       files={"file": ("f.jpg", b"", "image/jpeg")}).status_code == 400
    assert post(b"ok-bytes", policy="does_not_exist").status_code == 400


def test_review_queue_roundtrip() -> None:
    # Find a case the system declines to decide alone, so routing is exercised for real
    # rather than by inserting a row directly.
    flagged = None
    if MOCK:
        for n in range(5000):
            b = post(b"queue-probe-%d" % n).json()
            if b["review_required"] and b["status"] == "ok":
                flagged = b
                break
    else:
        # Real model: walk held-out faces until one lands in the review band. Ages near
        # a band boundary are the likeliest to straddle one, so start there.
        for folder in ("018", "017", "065", "064", "030", "050"):
            d = SAMPLES / folder
            if not d.is_dir():
                continue
            for p in sorted(d.iterdir())[:40]:
                b = post(p.read_bytes()).json()
                if b["review_required"] and b["status"] == "ok":
                    flagged = b
                    break
            if flagged:
                break
    assert flagged, "no case routed to review — the queue path is untested"

    q = client.get("/api/review-queue").json()
    ids = [i["request_id"] for i in q["items"]]
    assert flagged["request_id"] in ids
    assert q["count"] == len(q["items"])

    rid = flagged["request_id"]
    res = client.post(f"/api/review-queue/{rid}/resolve",
                      json={"reviewer": "dr_a", "verdict": "override", "override_age": 21})
    assert res.status_code == 200 and res.json()["verdict"] == "override"

    still_open = [i["request_id"] for i in client.get("/api/review-queue").json()["items"]]
    assert rid not in still_open, "resolved item must leave the open queue"

    assert client.post(f"/api/review-queue/{rid}/resolve",
                       json={"reviewer": "dr_a", "verdict": "accept"}).status_code == 404
    assert client.post(f"/api/review-queue/{rid}/resolve",
                       json={"reviewer": "dr_a", "verdict": "nonsense"}).status_code == 400


def test_audit_stores_digest_never_bytes() -> None:
    secret = b"this-must-never-be-persisted"
    post(secret)
    rows = client.get("/api/audit?limit=200").json()["items"]
    assert rows, "predict must be audited"

    digest = hashlib.sha256(secret).hexdigest()
    assert any(r["image_sha256"] == digest for r in rows), "digest must be recorded"

    blob = store.DB_PATH.read_bytes()
    assert secret not in blob, "raw image bytes leaked into the database"
    assert digest.encode() in blob


def main(pattern: str | None = None) -> int:
    """Run all contract tests, or only those whose name contains `pattern`."""
    tests = [
        v for k, v in sorted(globals().items())
        if k.startswith("test_") and (pattern is None or pattern in k)
    ]
    if not tests:
        print(f"no test matches {pattern!r}")
        return 2

    with client:  # entering the context fires the app lifespan (DB schema)
        for t in tests:
            t()
            print(f"  ok  {t.__name__}")
    store.DB_PATH.unlink(missing_ok=True)
    print(f"\n{len(tests)} contract test{'s' if len(tests) != 1 else ''} passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else None))
