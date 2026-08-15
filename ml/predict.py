"""Serving adapter: trained weights -> the raw shape server/main.py expects.

`server/main.py::_load_predictor` imports this lazily, so the API still boots with no
torch installed. Everything this class returns is pre-envelope: main.py::_envelope owns
the contract, and bands.py owns the decision. This file decides nothing clinical.

Face detection lives here rather than in training because it is a serving concern: it is
what turns an unusable upload into the contract's `no_face` / `multi_face` states instead
of a confident prediction about a photo of a wall.
"""

from __future__ import annotations

import io
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from .data import build_transforms
from .model import AgeModel, decode

# Absolute, not cwd-relative: uvicorn is started from wherever the demo laptop happens
# to be, and a checkpoint that silently fails to resolve means a blank console on stage.
CKPT_ROOT = Path(__file__).resolve().parent.parent / "checkpoints"
DEFAULT_HEAD = "dist"
MIN_FACE_PX = 64          # below this the crop carries too little detail to be honest
VERSION = "1.0.0"

# Measured on 300 training images: the Haar box covers a median 0.55 of the frame the
# model was trained on, so reproducing that framing needs ~41% padding per side. The
# previous 18% cropped visibly tighter than training — a train/serve mismatch.
FACE_PAD = 0.41

# Same probe: the cascade found a face in only 231/300 (77%) of clean, frontal,
# already-cropped training images. A detector that weak must not hold a veto.
PRECROPPED_PX = 200       # at or below this, near-square, treat the frame as the face


class Predictor:
    def __init__(self, head: str = DEFAULT_HEAD, ckpt_root: Path = CKPT_ROOT):
        self.dir = ckpt_root / head
        ck_path, metrics_path = self.dir / "model.pt", self.dir / "metrics.json"
        if not ck_path.exists():
            raise FileNotFoundError(
                f"no checkpoint at {ck_path}. Train one first:\n"
                f"  python -m ml.train --head {head}")

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        ck = torch.load(ck_path, map_location=self.device, weights_only=True)
        self.head = ck["head"]
        self.model = AgeModel(head=self.head, pretrained=False).to(self.device).eval()
        self.model.load_state_dict(ck["state_dict"])

        self._metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else {}
        self._quantiles = self._metrics.get("confidence_quantiles") or []
        self.tf = build_transforms(train=False)
        self._detector = None

    # --- face detection ----------------------------------------------------

    def _faces(self, img: Image.Image) -> list[tuple[int, int, int, int]]:
        """Haar cascade, bundled with opencv — no model download, works offline."""
        import cv2  # noqa: PLC0415 - optional at import time

        if self._detector is None:
            self._detector = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

        grey = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
        boxes = self._detector.detectMultiScale(grey, scaleFactor=1.1, minNeighbors=5,
                                                minSize=(32, 32))
        return [tuple(int(v) for v in b) for b in boxes]

    # --- percentile mapping ------------------------------------------------

    def _percentile(self, conf: float) -> float:
        """Where this confidence sits in the validation distribution, in [0, 1].

        The routing rule is a percentile, so it is only meaningful against the
        distribution measured at training time — which train.py ships in metrics.json.
        """
        if not self._quantiles:
            return 0.5
        below = sum(1 for q in self._quantiles if q <= conf)
        return min(1.0, max(0.0, below / len(self._quantiles)))

    # --- the interface server/main.py calls --------------------------------

    def predict(self, data: bytes) -> dict:
        try:
            img = Image.open(io.BytesIO(data)).convert("RGB")
        except Exception:
            return {"status": "low_quality", "quality_reason": "file is not a readable image"}

        # A small near-square image is already a face crop in this dataset's own format;
        # running a cascade over it mostly produces false negatives on valid input.
        precropped = (max(img.size) <= PRECROPPED_PX
                      and 0.9 <= img.width / img.height <= 1.11)

        boxes: list[tuple[int, int, int, int]] = []
        if not precropped:
            try:
                boxes = self._faces(img)
            except Exception:
                boxes = []                  # detector unavailable: fall back to whole frame

        face_box = None
        degraded: str | None = None

        if len(boxes) > 1:
            return {"status": "multi_face",
                    "face_box": list(max(boxes, key=lambda b: b[2] * b[3]))}

        if len(boxes) == 1:
            x, y, w, h = boxes[0]
            if min(w, h) < MIN_FACE_PX:
                return {"status": "low_quality",
                        "quality_reason": f"face region {w}x{h}px, below {MIN_FACE_PX}px minimum",
                        "face_box": [x, y, w, h]}
            pad = int(FACE_PAD * max(w, h))
            img = img.crop((max(0, x - pad), max(0, y - pad),
                            min(img.width, x + w + pad), min(img.height, y + h + pad)))
            face_box = [x, y, w, h]
        elif not precropped:
            # Detector found nothing. It is only 77% recall on our own clean data, so a
            # miss is far more likely to be a weak cascade than an absent face. Predict on
            # the whole frame and force the case to a human instead of rejecting it —
            # "review beats verified and rejected" applies to this path too.
            degraded = "face region not localised; predicted on the full frame"

        with torch.no_grad():
            x_t = self.tf(img).unsqueeze(0).to(self.device)
            out = self.model(x_t)
        d = decode(out.float(), self.head)[0]

        pct = self._percentile(d.confidence)
        out_body = {
            "status": "ok",
            "age_estimate": round(d.age, 1),
            "age_interval": [round(d.lo, 1), round(d.hi, 1)],
            "confidence": round(d.confidence, 3),
            "confidence_percentile": round(pct, 3),
            "face_box": face_box,
        }
        if degraded:
            # Force this into the review band rather than letting a full-frame guess be
            # auto-actioned. bands.decide() routes anything at or below the percentile
            # threshold, so pinning it to 0.0 is what makes the downgrade binding.
            out_body["confidence_percentile"] = 0.0
            out_body["degraded"] = degraded
        return out_body

    def meta(self) -> dict:
        return {
            "name": self._metrics.get("backbone", "efficientnet_b0"),
            "version": VERSION,
            "head": self.head,
        }

    def metrics(self) -> dict:
        t = self._metrics.get("test", {})
        return {
            "mae": _round(t.get("mae")),
            "cs5": _round(t.get("cs5"), 3),
            "band_accuracy": _round(t.get("band_accuracy"), 3),
            "baseline_mae": _round(t.get("baseline_mae")),
            "per_band_mae": t.get("per_band_mae", []),
            "n_test": t.get("n"),
        }

    def calibration(self) -> list[dict]:
        return self._metrics.get("calibration", [])

    def evidence(self) -> dict:
        """Coverage and selective-prediction evidence, written by ml/evaluate.py.

        Kept separate from metrics() because it answers a different question: metrics say
        how accurate the model is, this says whether its stated uncertainty can be
        trusted. Absent until evaluate.py has run, and the UI renders that absence rather
        than inventing numbers.
        """
        p = self.dir / "evidence.json"
        if not p.exists():
            return {}
        try:
            d = json.loads(p.read_text())
        except Exception:
            return {}
        rc = d.get("risk_coverage", {})
        return {
            "calibration_curve": d.get("calibration", []),
            "risk_coverage": {
                # Downsample: the UI draws a line, it does not need 100 points.
                "curve": rc.get("curve", [])[::4],
                "oracle": rc.get("oracle", [])[::4],
                "aurc": rc.get("aurc"),
                "aurc_oracle": rc.get("aurc_oracle"),
                "full_coverage_mae": rc.get("full_coverage_mae"),
                "mae_at_85pct_coverage": rc.get("mae_at_85pct_coverage"),
            },
        }


def _round(v, nd: int = 2):
    return round(v, nd) if isinstance(v, (int, float)) else None


def _selfcheck() -> None:
    """Run: python -m ml.predict  (no checkpoint needed — exercises the pure logic)"""
    p = Predictor.__new__(Predictor)          # bypass __init__; no weights on disk

    p._quantiles = [i / 100 for i in range(101)]
    assert p._percentile(-1.0) == 0.0, "below every observed confidence"
    assert p._percentile(2.0) == 1.0, "above every observed confidence"
    assert 0.45 <= p._percentile(0.5) <= 0.55, p._percentile(0.5)
    lo, hi = p._percentile(0.1), p._percentile(0.9)
    assert lo < hi, "percentile must increase with confidence"

    p._quantiles = []
    assert p._percentile(0.7) == 0.5, "no quantiles -> neutral, never a fake extreme"

    p._metrics = {"test": {"mae": 4.8123, "cs5": 0.61234, "band_accuracy": 0.881,
                           "baseline_mae": 11.2, "per_band_mae": [], "n": 47568}}
    m = p.metrics()
    assert m["mae"] == 4.81 and m["cs5"] == 0.612 and m["n_test"] == 47568
    p._metrics = {}
    assert p.metrics()["mae"] is None, "no metrics -> None, never a placeholder number"

    print("predict.py selfcheck OK")


if __name__ == "__main__":
    _selfcheck()
