"""Train the age model and produce every artifact the API needs.

    python -m ml.train --head dist --epochs 12
    python -m ml.train --head scalar --epochs 12        # the honest baseline, for the A/B
    python -m ml.train --head dist --epochs 1 --limit-per-age 20   # smoke run, ~2 min

Writes checkpoints/<head>/:
    model.pt      weights + the config needed to rebuild the model
    metrics.json  headline metrics, per-band MAE, calibration table, confidence quantiles

The confidence quantiles are the load-bearing artifact. The API routes a case to human
review when its confidence falls in the bottom REVIEW_PERCENTILE of the *validation*
distribution — so that distribution has to be measured here and shipped with the weights,
or the routing rule has no meaning at serve time.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from torch import Tensor

from server import bands as bandsmod

from .data import DEFAULT_ROOT, loaders
from .model import IMAGE_SIZE, AgeModel, decode

CKPT_ROOT = Path(__file__).resolve().parent.parent / "checkpoints"

# Imported, never redeclared: server/bands.py is the single owner of age boundaries, so
# published per-band MAE is computed against exactly the bands the API decides with.
BANDS = [(b["id"], b["min"], b["max"]) for b in bandsmod.bands()]

# The 90+ tail is 273 training images. Reported separately because it sits inside
# "geriatric", and a band-level number would hide it the same way a single headline MAE
# would hide the band-level ones.
SUB_BANDS = [("geriatric_90plus", 90, 120)]


def device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


@torch.no_grad()
def evaluate(model: AgeModel, loader, dev: torch.device, amp: bool = True) -> dict:
    """Predictions over a whole split, plus the metrics derived from them.

    `amp=False` for the final pass that produces shipped artifacts. Serving runs fp32,
    and confidence is a normalised entropy that sigma=2 soft labels compress into a
    narrow range — measuring the quantiles in a different precision than serve time
    would shift a live prediction by several percentiles, which is exactly the quantity
    the review-routing threshold reads.
    """
    model.eval()
    ages, preds, confs = [], [], []
    use_amp = amp and dev.type == "cuda"
    for x, y in loader:
        x = x.to(dev, non_blocking=True)
        with torch.autocast("cuda", dtype=torch.float16, enabled=use_amp):
            out = model(x)
        for d in decode(out.float(), model.head):
            preds.append(d.age)
            confs.append(d.confidence)
        ages.extend(y.tolist())

    a = torch.tensor(ages)
    p = torch.tensor(preds)
    err = (p - a).abs()

    return {
        "n": len(ages),
        "mae": err.mean().item(),
        "cs5": (err <= 5).float().mean().item(),
        "band_accuracy": _band_accuracy(a, p),
        "per_band_mae": _per_band_mae(a, err),
        "baseline_mae": (a - a.mean()).abs().mean().item(),
        "_ages": ages, "_preds": preds, "_confs": confs,
    }


def _band_of(age: float) -> str:
    for name, lo, hi in BANDS:
        if lo <= age <= hi:
            return name
    return BANDS[-1][0] if age > BANDS[-1][1] else BANDS[0][0]


def _band_accuracy(ages: Tensor, preds: Tensor) -> float:
    hit = sum(_band_of(a) == _band_of(p) for a, p in zip(ages.tolist(), preds.tolist()))
    return hit / len(ages)


def _per_band_mae(ages: Tensor, err: Tensor) -> list[dict]:
    """MAE within each clinical band, plus the sparse sub-tail.

    Mandatory rather than optional: a single headline MAE would hide how weak the model
    is in the thin bands, and a band-level geriatric number would in turn hide the 90+
    tail inside it.
    """
    out = []
    for name, lo, hi in BANDS + SUB_BANDS:
        m = (ages >= lo) & (ages <= hi)
        n = int(m.sum())
        out.append({"band": name, "n": n,
                    "mae": err[m].mean().item() if n else None})
    return out


def calibration_table(confs: list[float], ages: list[float], preds: list[float]) -> list[dict]:
    """MAE per confidence decile.

    This is what makes the review queue defensible rather than decorative: if
    low-confidence predictions are not measurably worse, the routing rule is theatre
    and we should say so on the slide instead of pretending otherwise.
    """
    order = sorted(range(len(confs)), key=lambda i: confs[i])
    rows, k = [], max(1, len(order) // 10)
    for d in range(10):
        idx = order[d * k: (d + 1) * k] if d < 9 else order[9 * k:]
        if not idx:
            continue
        errs = [abs(preds[i] - ages[i]) for i in idx]
        rows.append({
            "decile": d + 1,
            "n": len(idx),
            "conf_min": round(min(confs[i] for i in idx), 4),
            "conf_max": round(max(confs[i] for i in idx), 4),
            "mae": round(sum(errs) / len(errs), 3),
        })
    return rows


def monotonic_fraction(rows: list[dict]) -> float:
    """Share of adjacent deciles where MAE falls as confidence rises. 1.0 == perfect."""
    if len(rows) < 2:
        return 0.0
    drops = sum(1 for a, b in zip(rows, rows[1:]) if b["mae"] <= a["mae"])
    return drops / (len(rows) - 1)


# --- pre-registered go/no-go for the review queue ---------------------------
# Written down before the first run, and deliberately stated in terms of the quantity
# routing actually uses. Per-sample rank correlation between confidence and |error| is
# noisy enough that a well-calibrated model would still miss a demanding threshold, so
# a bar set that way would pre-register a "our queue is theatre" slide regardless of the
# model. These two are the honest test, and moving them after seeing the numbers is the
# exact dishonesty pre-registration exists to prevent.
QUEUE_MAE_RATIO_MIN = 1.30      # bottom-decile MAE / top-decile MAE
QUEUE_MONOTONIC_MIN = 0.70      # share of adjacent deciles that improve


def queue_verdict(rows: list[dict]) -> dict:
    """Does confidence actually predict error? Decides what the slide says."""
    if len(rows) < 2:
        return {"passed": False, "reason": "not enough deciles"}
    ratio = rows[0]["mae"] / rows[-1]["mae"] if rows[-1]["mae"] else float("inf")
    mono = monotonic_fraction(rows)
    passed = ratio >= QUEUE_MAE_RATIO_MIN and mono >= QUEUE_MONOTONIC_MIN
    return {
        "passed": passed,
        "bottom_top_mae_ratio": round(ratio, 3),
        "monotonic_fraction": round(mono, 3),
        "thresholds": {"ratio_min": QUEUE_MAE_RATIO_MIN, "monotonic_min": QUEUE_MONOTONIC_MIN},
        "claim": (
            "Low-confidence predictions are measurably worse, so confidence-based "
            "routing is doing real work."
            if passed else
            "Confidence does not reliably predict error on this model. The review queue "
            "routes on interval-straddles-band-boundary only; the percentile rule is "
            "reported but not defensible."
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--head", choices=["dist", "scalar"], default="dist")
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--batch-size", type=int, default=96)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--limit-per-age", type=int, default=None)
    ap.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    ap.add_argument("--size", type=int, default=IMAGE_SIZE)
    # Runs must not overwrite each other: model.pt and metrics.json ship as a pair, and
    # a mismatched pair silently mis-thresholds routing because confidence_quantiles
    # belong to one specific set of weights.
    ap.add_argument("--tag", default="", help="suffix for the checkpoint dir")
    ap.add_argument("--resume", action="store_true",
                    help="continue from the checkpoint in the tagged dir")
    args = ap.parse_args()

    dev = device()
    print(f"device      {dev} ({torch.cuda.get_device_name(0) if dev.type == 'cuda' else 'cpu'})")
    print(f"head        {args.head}")

    train_dl, val_dl, test_dl = loaders(
        args.root, args.batch_size, args.workers, limit_per_age=args.limit_per_age,
        size=args.size)
    print(f"train/val/test  {len(train_dl.dataset):,} / {len(val_dl.dataset):,} / "
          f"{len(test_dl.dataset):,}")

    out_dir = CKPT_ROOT / (args.head + (f"-{args.tag}" if args.tag else ""))
    out_dir.mkdir(parents=True, exist_ok=True)

    model = AgeModel(head=args.head).to(dev)
    best = float("inf")
    start_epoch = 1

    # Resolve the starting epoch before the scheduler is built: OneCycle needs the exact
    # number of steps it will actually run, and it restarts its schedule on a resume.
    if args.resume and (out_dir / "model.pt").exists():
        # Only weights and the score are restored — optimizer and scheduler state are not
        # checkpointed. Good enough to salvage a crashed run; not equivalent to an
        # uninterrupted one, and the metrics record that it was resumed.
        ck = torch.load(out_dir / "model.pt", map_location=dev, weights_only=True)
        model.load_state_dict(ck["state_dict"])
        best, start_epoch = ck["val_mae"], ck["epoch"] + 1
        print(f"resumed     epoch {ck['epoch']} (val MAE {best:.3f}) -> continuing "
              f"from epoch {start_epoch}")

    remaining = max(1, args.epochs - start_epoch + 1)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(
        opt, max_lr=args.lr, total_steps=remaining * len(train_dl), pct_start=0.25)
    scaler = torch.amp.GradScaler("cuda", enabled=dev.type == "cuda")

    for epoch in range(start_epoch, args.epochs + 1):
        model.train()
        t0, running = time.time(), 0.0
        for step, (x, y) in enumerate(train_dl, 1):
            x, y = x.to(dev, non_blocking=True), y.to(dev, non_blocking=True)
            opt.zero_grad(set_to_none=True)
            with torch.autocast("cuda", dtype=torch.float16, enabled=dev.type == "cuda"):
                loss = model.loss(model(x), y)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            sched.step()

            running += loss.item()
            if step % 100 == 0 or step == len(train_dl):
                rate = step * train_dl.batch_size / (time.time() - t0)
                print(f"  e{epoch:02d} {step:5d}/{len(train_dl)}  loss {running / step:.4f}"
                      f"  {rate:.0f} img/s", flush=True)

        val = evaluate(model, val_dl, dev)
        print(f"epoch {epoch:02d}  val MAE {val['mae']:.3f}  CS@5 {val['cs5']:.3f}"
              f"  band {val['band_accuracy']:.3f}  ({time.time() - t0:.0f}s)")

        if val["mae"] < best:
            best = val["mae"]
            torch.save({"head": args.head, "state_dict": model.state_dict(),
                        "epoch": epoch, "val_mae": best}, out_dir / "model.pt")
            print(f"           saved (best so far)")

    # Reload the best epoch before producing the shipped numbers.
    # weights_only=True: the checkpoint holds only tensors and primitives, so there is no
    # reason to let torch.load unpickle arbitrary objects.
    ck = torch.load(out_dir / "model.pt", map_location=dev, weights_only=True)
    model.load_state_dict(ck["state_dict"])

    # fp32 for the artifact-producing pass: these numbers ship and must match serving.
    val = evaluate(model, val_dl, dev, amp=False)
    test = evaluate(model, test_dl, dev, amp=False)

    # Calibration evidence comes from the untouched test split — val chose the epoch, so
    # using it here would be grading the queue on the data that selected the model.
    # Quantiles stay on val: they define the routing threshold, not the evidence for it.
    cal = calibration_table(test["_confs"], test["_ages"], test["_preds"])
    quantiles = sorted(val["_confs"])

    metrics = {
        "head": args.head,
        "backbone": "efficientnet_b0",
        "epochs": args.epochs,
        "best_epoch": ck["epoch"],
        "val": {k: v for k, v in val.items() if not k.startswith("_")},
        "test": {k: v for k, v in test.items() if not k.startswith("_")},
        "calibration": cal,
        "calibration_monotonic_fraction": monotonic_fraction(cal),
        "queue_verdict": queue_verdict(cal),
        # 101 points: percentile 0..100 of the validation confidence distribution.
        # The API maps a live confidence onto this to get confidence_percentile.
        "confidence_quantiles": [
            quantiles[min(len(quantiles) - 1, round(i / 100 * (len(quantiles) - 1)))]
            for i in range(101)
        ],
    }
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))

    print(f"\n=== {args.head} ===")
    print(f"test MAE       {test['mae']:.3f}   (baseline {test['baseline_mae']:.3f})")
    print(f"test CS@5      {test['cs5']:.3f}")
    print(f"band accuracy  {test['band_accuracy']:.3f}")
    print("per-band MAE:")
    for r in test["per_band_mae"]:
        print(f"   {r['band']:12} n={r['n']:6,}  MAE {r['mae']:.2f}" if r["mae"]
              else f"   {r['band']:12} n=0")
    v = metrics["queue_verdict"]
    print(f"\nreview queue   {'PASS' if v['passed'] else 'FAIL'}  "
          f"(bottom/top decile MAE {v['bottom_top_mae_ratio']}x, "
          f"monotonic {v['monotonic_fraction']:.0%})")
    print(f"   {v['claim']}")
    print(f"\nwritten to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
