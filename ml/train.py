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

from .data import DEFAULT_ROOT, loaders
from .model import AgeModel, decode

CKPT_ROOT = Path("checkpoints")
BANDS = [
    ("paediatric", 0, 17), ("young_adult", 18, 29), ("adult", 30, 49),
    ("older_adult", 50, 64), ("geriatric", 65, 120),
]


def device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


@torch.no_grad()
def evaluate(model: AgeModel, loader, dev: torch.device) -> dict:
    """Predictions over a whole split, plus the metrics derived from them."""
    model.eval()
    ages, preds, confs = [], [], []
    use_amp = dev.type == "cuda"
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
    """MAE within each clinical band. Mandatory: the 90+ tail is 273 training images,
    and a single headline MAE would hide how weak the model is there."""
    out = []
    for name, lo, hi in BANDS:
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--head", choices=["dist", "scalar"], default="dist")
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--batch-size", type=int, default=96)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--limit-per-age", type=int, default=None)
    ap.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    args = ap.parse_args()

    dev = device()
    print(f"device      {dev} ({torch.cuda.get_device_name(0) if dev.type == 'cuda' else 'cpu'})")
    print(f"head        {args.head}")

    train_dl, val_dl, test_dl = loaders(
        args.root, args.batch_size, args.workers, limit_per_age=args.limit_per_age)
    print(f"train/val/test  {len(train_dl.dataset):,} / {len(val_dl.dataset):,} / "
          f"{len(test_dl.dataset):,}")

    model = AgeModel(head=args.head).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(
        opt, max_lr=args.lr, total_steps=args.epochs * len(train_dl), pct_start=0.25)
    scaler = torch.amp.GradScaler("cuda", enabled=dev.type == "cuda")

    out_dir = CKPT_ROOT / args.head
    out_dir.mkdir(parents=True, exist_ok=True)
    best = float("inf")

    for epoch in range(1, args.epochs + 1):
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

    val = evaluate(model, val_dl, dev)
    test = evaluate(model, test_dl, dev)
    cal = calibration_table(val["_confs"], val["_ages"], val["_preds"])
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
    print(f"calibration monotonic  {metrics['calibration_monotonic_fraction']:.0%} "
          f"of adjacent deciles improve")
    print(f"\nwritten to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
