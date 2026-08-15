"""Age model: backbone + head, and the decoding shared by training and serving.

Two heads, because which one wins is a measured question rather than an assumption:

  dist    softmax over one bin per year of age. Trained on soft labels (a Gaussian
          centred on the true age), so the network is told that predicting 34 for a
          35-year-old is nearly right — a plain 100-way classifier is not told that.
          The predicted distribution then hands us three things for free:
            - point estimate  : its expected value
            - 80% interval    : its 10th and 90th percentiles
            - confidence      : how concentrated it is
          The review queue needs all three, which is why this head is the default.

  scalar  one number, Huber loss. The honest baseline. Gets an interval only from
          test-time-augmentation spread, which is a weaker signal.

`decode()` is the single place a raw head output becomes the numbers the API contract
talks about, so training metrics and served predictions can never drift apart.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import timm
import torch
import torch.nn.functional as F
from torch import Tensor, nn

MIN_AGE, MAX_AGE = 1, 100
N_BINS = MAX_AGE - MIN_AGE + 1
BACKBONE = "efficientnet_b0"
IMAGE_SIZE = 224
LABEL_SIGMA = 2.0  # years; width of the soft label


def bin_centres(device: torch.device | str = "cpu") -> Tensor:
    return torch.arange(MIN_AGE, MAX_AGE + 1, dtype=torch.float32, device=device)


def soft_labels(ages: Tensor, sigma: float = LABEL_SIGMA) -> Tensor:
    """Gaussian over age bins, normalised. ages: (B,) float -> (B, N_BINS)."""
    centres = bin_centres(ages.device).unsqueeze(0)          # (1, K)
    d = centres - ages.unsqueeze(1).float()                  # (B, K)
    logits = -(d ** 2) / (2 * sigma ** 2)
    return F.softmax(logits, dim=1)


class AgeModel(nn.Module):
    def __init__(self, head: str = "dist", backbone: str = BACKBONE, pretrained: bool = True):
        super().__init__()
        if head not in ("dist", "scalar"):
            raise ValueError(f"head must be 'dist' or 'scalar', got {head!r}")
        self.head = head
        self.backbone = timm.create_model(backbone, pretrained=pretrained, num_classes=0)
        feat = self.backbone.num_features
        self.fc = nn.Sequential(
            nn.Dropout(0.2),
            nn.Linear(feat, N_BINS if head == "dist" else 1),
        )

    def forward(self, x: Tensor) -> Tensor:
        return self.fc(self.backbone(x))

    def loss(self, out: Tensor, ages: Tensor) -> Tensor:
        if self.head == "dist":
            # cross-entropy against the soft target == KL up to a constant
            return -(soft_labels(ages) * F.log_softmax(out, dim=1)).sum(1).mean()
        return F.huber_loss(out.squeeze(1), ages.float(), delta=5.0)


@dataclass
class Decoded:
    age: float
    lo: float
    hi: float
    confidence: float


def decode(out: Tensor, head: str) -> list[Decoded]:
    """Raw head output -> the contract's numbers. (B, K) or (B, 1) in, list of B out."""
    if head == "scalar":
        # No distribution to read an interval from. A fixed band derived from the
        # model's own validation MAE is set by train.py; until then use a placeholder
        # that is clearly wide rather than a fake-precise one.
        ages = out.squeeze(1).clamp(MIN_AGE, MAX_AGE)
        return [Decoded(float(a), float(a) - 6.0, float(a) + 6.0, 0.5) for a in ages]

    p = F.softmax(out, dim=1)                                 # (B, K)
    centres = bin_centres(out.device)
    ages = (p * centres).sum(1)                               # expected value

    # 10th / 90th percentile of the predicted distribution -> 80% interval
    cdf = p.cumsum(1)
    lo = _quantile_from_cdf(cdf, centres, 0.10)
    hi = _quantile_from_cdf(cdf, centres, 0.90)

    # Concentration: 1 - normalised entropy. Peaked -> near 1, flat -> near 0.
    entropy = -(p.clamp_min(1e-12).log() * p).sum(1)
    conf = 1.0 - entropy / math.log(N_BINS)

    return [
        Decoded(float(a), float(l), float(h), float(c))
        for a, l, h, c in zip(ages, lo, hi, conf)
    ]


def _quantile_from_cdf(cdf: Tensor, centres: Tensor, q: float) -> Tensor:
    """First bin centre whose cumulative mass reaches q, per row."""
    idx = (cdf < q).sum(1).clamp(max=N_BINS - 1)
    return centres[idx]


def _selfcheck() -> None:
    """Run: python ml/model.py  (no network, no weights download)"""
    ages = torch.tensor([10.0, 35.0, 80.0])
    sl = soft_labels(ages)
    assert sl.shape == (3, N_BINS)
    assert torch.allclose(sl.sum(1), torch.ones(3), atol=1e-5), "soft labels normalise"
    # peak sits on the true age
    assert (sl.argmax(1) + MIN_AGE == ages.long()).all(), "peak at the true age"

    # A distribution that IS the soft label should decode back to the age it encodes.
    logits = (sl.clamp_min(1e-12)).log()
    got = decode(logits, "dist")
    for d, want in zip(got, [10.0, 35.0, 80.0]):
        assert abs(d.age - want) < 0.5, (d.age, want)
        assert d.lo < d.age < d.hi, "interval must bracket the estimate"
        assert 0.0 <= d.confidence <= 1.0

    # A confident prediction must beat a flat one, and its interval must be tighter.
    flat = torch.zeros(1, N_BINS)
    sharp = (soft_labels(torch.tensor([40.0]), sigma=1.0).clamp_min(1e-12)).log()
    d_flat, d_sharp = decode(flat, "dist")[0], decode(sharp, "dist")[0]
    assert d_sharp.confidence > d_flat.confidence, "peaked must be more confident"
    assert (d_sharp.hi - d_sharp.lo) < (d_flat.hi - d_flat.lo), "peaked must be tighter"

    # Wider soft labels -> lower confidence. Confidence tracks spread, monotonically.
    c = [decode((soft_labels(torch.tensor([50.0]), sigma=s).clamp_min(1e-12)).log(),
                "dist")[0].confidence for s in (1.0, 3.0, 9.0)]
    assert c[0] > c[1] > c[2], f"confidence must fall as spread grows: {c}"

    assert decode(torch.tensor([[35.0]]), "scalar")[0].age == 35.0
    print("model.py selfcheck OK")


if __name__ == "__main__":
    _selfcheck()
