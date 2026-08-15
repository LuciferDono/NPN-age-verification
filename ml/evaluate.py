"""Calibration and selective-prediction evidence for a trained checkpoint.

    python -m ml.evaluate --tag dist-v1

Produces two things the decile table cannot say, and writes both as data and as SVG:

  calibration curve  Does an 80% interval actually contain the truth 80% of the time?
                     The decile table shows confidence *ranks* error (discrimination).
                     Coverage is a different claim (calibration), and a panel that knows
                     the difference will ask for it. Kuleshov et al., UAI 2018.

  risk-coverage      The standard presentation for selective prediction: sort by
                     confidence, defer the least confident first, and plot error on what
                     remains against the fraction retained. Summarised as AURC. This is
                     the field-standard form of the claim our review queue makes.

Both are computed on the held-out test split with the shipped model, in fp32, using the
same decode() path that serves predictions — so these numbers describe the deployed
system rather than a training-time approximation.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from .data import DEFAULT_ROOT, AgeFolder, find_items
from .model import IMAGE_SIZE, AgeModel, bin_centres

CKPT_ROOT = Path(__file__).resolve().parent.parent / "checkpoints"
DOCS = Path(__file__).resolve().parent.parent / "docs"

# Nominal central-interval levels to check coverage at.
LEVELS = [0.50, 0.60, 0.70, 0.80, 0.90, 0.95]


@torch.no_grad()
def collect(tag: str, root: Path, batch: int, workers: int, tta: bool) -> dict:
    """Per-image age, prediction, confidence, and interval bounds at every level."""
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ck = torch.load(CKPT_ROOT / tag / "model.pt", map_location=dev, weights_only=True)
    model = AgeModel(head=ck["head"], pretrained=False).to(dev).eval()
    model.load_state_dict(ck["state_dict"])

    items = find_items(root / "test")
    if not items:
        raise SystemExit(f"no test images under {root / 'test'}")
    dl = DataLoader(AgeFolder(items, False, IMAGE_SIZE), batch_size=batch, shuffle=False,
                    num_workers=workers, pin_memory=True)

    centres = bin_centres(dev)
    n_bins = centres.numel()
    ages: list[float] = []
    preds: list[float] = []
    confs: list[float] = []
    # interval bounds per nominal level
    bounds: dict[float, list[tuple[float, float]]] = {lv: [] for lv in LEVELS}

    for x, y in dl:
        x = x.to(dev, non_blocking=True)
        logits = model(x).float()
        if tta:
            # Average the two distributions, not the two logit tensors: the model is a
            # distribution predictor, and averaging in probability space is what the
            # serving path would do.
            p = (logits.softmax(1) + model(torch.flip(x, dims=[3])).float().softmax(1)) / 2
        else:
            p = logits.softmax(1)

        cdf = p.cumsum(1)
        ev = (p * centres).sum(1)

        # Normalised entropy -> confidence, matching model.decode().
        ent = -(p.clamp_min(1e-12).log() * p).sum(1)
        conf = 1.0 - ent / torch.log(torch.tensor(float(n_bins), device=dev))

        for lv in LEVELS:
            lo_q, hi_q = (1 - lv) / 2, 1 - (1 - lv) / 2
            lo = centres[(cdf < lo_q).sum(1).clamp(max=n_bins - 1)] - 0.5
            hi = centres[(cdf < hi_q).sum(1).clamp(max=n_bins - 1)] + 0.5
            bounds[lv] += list(zip(lo.tolist(), hi.tolist()))

        ages += y.tolist()
        preds += ev.tolist()
        confs += conf.tolist()

    return {"ages": ages, "preds": preds, "confs": confs,
            "bounds": {str(k): v for k, v in bounds.items()},
            "head": ck["head"], "epoch": ck["epoch"], "tta": tta}


def calibration(raw: dict) -> list[dict]:
    """Empirical coverage and mean width at each nominal level.

    Calibrated means empirical ~= nominal. Over-coverage is not a free win: an interval
    that always contains the truth because it spans 1-100 is useless, which is why
    sharpness (mean width) is reported alongside it.
    """
    ages = raw["ages"]
    rows = []
    for lv in LEVELS:
        pairs = raw["bounds"][str(lv)]
        hits = sum(1 for a, (lo, hi) in zip(ages, pairs) if lo <= a <= hi)
        widths = [hi - lo for lo, hi in pairs]
        rows.append({
            "nominal": lv,
            "empirical": round(hits / len(ages), 4),
            "gap": round(hits / len(ages) - lv, 4),
            "mean_width_years": round(sum(widths) / len(widths), 2),
            "n": len(ages),
        })
    return rows


def risk_coverage(raw: dict, steps: int = 100) -> dict:
    """MAE on the retained fraction as the least-confident cases are deferred.

    This is the selective-prediction claim in its standard form: if confidence is
    informative, deferring the least confident cases must lower the error on what
    remains. AURC summarises the whole curve; the oracle bound is the same sweep ordered
    by true error, i.e. the best any ranking could do.
    """
    order = sorted(range(len(raw["confs"])), key=lambda i: raw["confs"][i], reverse=True)
    err = [abs(raw["preds"][i] - raw["ages"][i]) for i in range(len(raw["ages"]))]

    def sweep(idx: list[int]) -> list[dict]:
        pts, run = [], 0.0
        for k, i in enumerate(idx, 1):
            run += err[i]
            if k % max(1, len(idx) // steps) == 0 or k == len(idx):
                pts.append({"coverage": round(k / len(idx), 4),
                            "selective_mae": round(run / k, 4)})
        return pts

    curve = sweep(order)
    oracle = sweep(sorted(range(len(err)), key=lambda i: err[i]))
    full_mae = sum(err) / len(err)

    def aurc(pts: list[dict]) -> float:
        return round(sum(p["selective_mae"] for p in pts) / len(pts), 4)

    return {
        "curve": curve,
        "oracle": oracle,
        "aurc": aurc(curve),
        "aurc_oracle": aurc(oracle),
        "full_coverage_mae": round(full_mae, 4),
        # What deferring the bottom 15% actually buys — the rule the API runs.
        "mae_at_85pct_coverage": next(p["selective_mae"] for p in curve
                                      if p["coverage"] >= 0.85),
    }


# --- plots -----------------------------------------------------------------
# Clinical paper palette, matching the console: warm ground, ochre accent, no gradients.
BG, INK, DIM, FAINT, LINE, SIGNAL, OK = (
    "#f4f3ef", "#23282a", "#5c635f", "#8b918b", "#dedbd2", "#b06a12", "#2f6b4f")


def _frame(w: int, h: int, pad: tuple[int, int, int, int]) -> tuple[str, callable, callable]:
    l, r, t, b = pad
    return (f'<rect width="{w}" height="{h}" fill="{BG}"/>',
            lambda fx: l + (w - l - r) * fx,
            lambda fy: t + (h - t - b) * (1 - fy))


def svg_calibration(rows: list[dict], w: int = 460, h: int = 380) -> str:
    bg, X, Y = _frame(w, h, (58, 20, 20, 44))
    grid = "".join(
        f'<line x1="{X(0)}" y1="{Y(v)}" x2="{X(1)}" y2="{Y(v)}" stroke="{LINE}"/>'
        f'<text x="{X(0) - 8}" y="{Y(v) + 3.5}" text-anchor="end" font-size="10" '
        f'font-family="IBM Plex Mono, monospace" fill="{FAINT}">{v:.1f}</text>'
        for v in (0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0))
    pts = " ".join(f'{X(r["nominal"])},{Y(r["empirical"])}' for r in rows)
    dots = "".join(
        f'<circle cx="{X(r["nominal"])}" cy="{Y(r["empirical"])}" r="3.5" fill="{INK}"/>'
        f'<text x="{X(r["nominal"])}" y="{Y(r["empirical"]) - 10}" text-anchor="middle" '
        f'font-size="9" font-family="IBM Plex Mono, monospace" fill="{DIM}">'
        f'{r["empirical"]:.2f}</text>' for r in rows)
    xlab = "".join(
        f'<text x="{X(r["nominal"])}" y="{h - 26}" text-anchor="middle" font-size="10" '
        f'font-family="IBM Plex Mono, monospace" fill="{FAINT}">{r["nominal"]:.2f}</text>'
        for r in rows)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
{bg}{grid}
<line x1="{X(0.4)}" y1="{Y(0.4)}" x2="{X(1)}" y2="{Y(1)}" stroke="{OK}" stroke-width="1.5"
      stroke-dasharray="5 4"/>
<text x="{X(0.97)}" y="{Y(0.94)}" text-anchor="end" font-size="10"
      font-family="Instrument Sans, sans-serif" fill="{OK}">perfect calibration</text>
<polyline points="{pts}" fill="none" stroke="{INK}" stroke-width="2"/>
{dots}{xlab}
<text x="{X(0.5)}" y="{h - 8}" text-anchor="middle" font-size="10"
      font-family="Instrument Sans, sans-serif" fill="{DIM}">nominal interval level</text>
<text x="14" y="{Y(0.5)}" font-size="10" font-family="Instrument Sans, sans-serif"
      fill="{DIM}" transform="rotate(-90 14 {Y(0.5)})" text-anchor="middle">empirical coverage</text>
</svg>'''


def svg_risk_coverage(rc: dict, w: int = 460, h: int = 380) -> str:
    bg, X, Y = _frame(w, h, (58, 20, 20, 44))
    ys = [p["selective_mae"] for p in rc["curve"]] + [p["selective_mae"] for p in rc["oracle"]]
    lo, hi = 0.0, max(ys) * 1.08

    def Yv(v: float) -> float:
        return Y((v - lo) / (hi - lo))

    ticks = [hi * i / 5 for i in range(6)]
    grid = "".join(
        f'<line x1="{X(0)}" y1="{Yv(v)}" x2="{X(1)}" y2="{Yv(v)}" stroke="{LINE}"/>'
        f'<text x="{X(0) - 8}" y="{Yv(v) + 3.5}" text-anchor="end" font-size="10" '
        f'font-family="IBM Plex Mono, monospace" fill="{FAINT}">{v:.1f}</text>' for v in ticks)
    line = " ".join(f'{X(p["coverage"])},{Yv(p["selective_mae"])}' for p in rc["curve"])
    orac = " ".join(f'{X(p["coverage"])},{Yv(p["selective_mae"])}' for p in rc["oracle"])
    xlab = "".join(
        f'<text x="{X(c)}" y="{h - 26}" text-anchor="middle" font-size="10" '
        f'font-family="IBM Plex Mono, monospace" fill="{FAINT}">{int(c * 100)}%</text>'
        for c in (0.2, 0.4, 0.6, 0.85, 1.0))
    at85 = rc["mae_at_85pct_coverage"]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
{bg}{grid}
<line x1="{X(0.85)}" y1="{Y(0)}" x2="{X(0.85)}" y2="{Y(1)}" stroke="{SIGNAL}"
      stroke-width="1.5" stroke-dasharray="4 3"/>
<text x="{X(0.845)}" y="{Y(1) + 12}" text-anchor="end" font-size="10"
      font-family="Instrument Sans, sans-serif" fill="{SIGNAL}">review threshold</text>
<polyline points="{orac}" fill="none" stroke="{FAINT}" stroke-width="1.5"
          stroke-dasharray="4 3"/>
<polyline points="{line}" fill="none" stroke="{INK}" stroke-width="2"/>
<circle cx="{X(0.85)}" cy="{Yv(at85)}" r="4" fill="none" stroke="{SIGNAL}" stroke-width="2"/>
<text x="{X(0.85) + 8}" y="{Yv(at85) - 8}" font-size="11"
      font-family="IBM Plex Mono, monospace" fill="{SIGNAL}">{at85:.2f}</text>
<text x="{X(0.30)}" y="{Yv(rc["oracle"][len(rc["oracle"]) // 3]["selective_mae"]) - 8}"
      font-size="10" font-family="Instrument Sans, sans-serif" fill="{FAINT}">oracle bound</text>
<text x="{X(0.5)}" y="{h - 8}" text-anchor="middle" font-size="10"
      font-family="Instrument Sans, sans-serif" fill="{DIM}">coverage (fraction auto-decided)</text>
<text x="14" y="{Y(0.5)}" font-size="10" font-family="Instrument Sans, sans-serif"
      fill="{DIM}" transform="rotate(-90 14 {Y(0.5)})" text-anchor="middle">selective MAE (years)</text>
</svg>'''


def _selfcheck() -> None:
    """Run: python -m ml.evaluate --selfcheck  (no model, no data)"""
    # A perfectly calibrated synthetic case: intervals that contain the truth exactly
    # at the nominal rate must read back as calibrated.
    n = 1000
    raw = {"ages": [50.0] * n, "preds": [50.0] * n, "confs": [0.5] * n, "bounds": {}}
    for lv in LEVELS:
        k = round(lv * n)
        raw["bounds"][str(lv)] = [(49.0, 51.0)] * k + [(90.0, 95.0)] * (n - k)
    for r in calibration(raw):
        assert abs(r["empirical"] - r["nominal"]) < 0.01, r
        assert abs(r["gap"]) < 0.01, r

    # Risk-coverage: when confidence is a perfect predictor of error, deferring the
    # least confident must strictly reduce selective MAE, and AURC must beat the
    # full-coverage MAE.
    m = 500
    errs = [float(i) for i in range(m)]
    good = {"ages": [0.0] * m, "preds": errs,
            "confs": [-e for e in errs], "bounds": {}}
    rc = risk_coverage(good)
    assert rc["curve"][0]["selective_mae"] < rc["curve"][-1]["selective_mae"], \
        "deferring the least confident must lower error on what remains"
    assert rc["aurc"] < rc["full_coverage_mae"], rc
    assert rc["aurc_oracle"] <= rc["aurc"] + 1e-6, "oracle cannot be beaten"

    # Anti-correlated confidence — the worst possible ranking — must score worse than
    # the informative one. Note the ties trap: sorted() is stable, so a fixture with
    # constant confidence silently keeps its input order, which would smuggle in whatever
    # ordering the errors already had.
    bad = {"ages": [0.0] * m, "preds": errs, "confs": errs, "bounds": {}}
    assert risk_coverage(bad)["aurc"] > rc["aurc"], \
        "informative confidence must beat an anti-correlated ordering"

    # When every prediction is equally wrong, deferring cannot help and must not appear to.
    same = {"ages": [0.0] * m, "preds": [7.0] * m, "confs": [0.5] * m, "bounds": {}}
    flat = risk_coverage(same)
    assert abs(flat["aurc"] - 7.0) < 1e-6 and abs(flat["full_coverage_mae"] - 7.0) < 1e-6, flat

    print("evaluate.py selfcheck OK")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selfcheck", action="store_true")
    ap.add_argument("--tag", default="dist-v1")
    ap.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    ap.add_argument("--batch-size", type=int, default=192)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--tta", action="store_true", help="average with the horizontal flip")
    a = ap.parse_args()
    if a.selfcheck:
        _selfcheck()
        return 0

    raw = collect(a.tag, a.root, a.batch_size, a.workers, a.tta)
    cal = calibration(raw)
    rc = risk_coverage(raw)

    DOCS.mkdir(parents=True, exist_ok=True)
    suffix = f"{a.tag}{'-tta' if a.tta else ''}"
    (DOCS / f"calibration-{suffix}.svg").write_text(svg_calibration(cal))
    (DOCS / f"risk-coverage-{suffix}.svg").write_text(svg_risk_coverage(rc))
    (DOCS / f"evaluation-{suffix}.json").write_text(json.dumps(
        {"tag": a.tag, "tta": a.tta, "epoch": raw["epoch"],
         "calibration": cal, "risk_coverage": rc}, indent=2))

    print(f"\nCALIBRATION  (n={cal[0]['n']:,}, does an X% interval contain the truth X% of the time?)")
    print(f"  {'nominal':>8} {'empirical':>10} {'gap':>8} {'width':>8}")
    for r in cal:
        print(f"  {r['nominal']:>8.2f} {r['empirical']:>10.3f} {r['gap']:>+8.3f} "
              f"{r['mean_width_years']:>7.1f}y")

    print(f"\nRISK-COVERAGE  (selective prediction)")
    print(f"  full coverage MAE      {rc['full_coverage_mae']:.3f}")
    print(f"  MAE at 85% coverage    {rc['mae_at_85pct_coverage']:.3f}"
          f"   ({(1 - rc['mae_at_85pct_coverage'] / rc['full_coverage_mae']) * 100:.1f}% better)")
    print(f"  AURC                   {rc['aurc']:.3f}   (oracle {rc['aurc_oracle']:.3f})")
    print(f"\nwritten to {DOCS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
