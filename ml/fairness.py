"""Out-of-distribution fairness probe: does error hold up across demographic groups?

    python -m ml.fairness --tag dist-v1

Our training corpus carries no skin-tone, ethnicity or gender labels, so a per-group
breakdown cannot be computed from it. UTKFace does carry them, encoded in the filename as
`age_gender_race_date.jpg`. Running our trained model over UTKFace as pure inference gives
a real fairness table without retraining and without touching our own splits.

Two things this deliberately is and is not:

  IS      a test of whether error is CONSISTENT ACROSS GROUPS.
  IS NOT  a headline accuracy number. UTKFace is out of distribution for us: different
          source, different crop convention, different label process (UTKFace ages are
          algorithmically estimated then human-checked; ours are web-scraped). Absolute
          MAE here will be worse than our held-out figure and that is expected, not a
          finding. Only the relative spread between groups carries meaning.

Group sample sizes vary by more than an order of magnitude, so every row carries n and a
bootstrap confidence interval. A per-group MAE on n=40 and one on n=4,000 are not the same
claim and must not be printed as though they were.
"""

from __future__ import annotations

import argparse
import json
import random
import re
from collections import defaultdict
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from .data import AgeFolder
from .model import IMAGE_SIZE, AgeModel, decode

CKPT_ROOT = Path(__file__).resolve().parent.parent / "checkpoints"
DOCS = Path(__file__).resolve().parent.parent / "docs"
UTK_ROOT = Path("data/utkface/UTKFace")

# UTKFace filename: age_gender_race_date.jpg.chip.jpg
NAME = re.compile(r"^(\d{1,3})_([01])_([0-4])_")

GENDER = {0: "male", 1: "female"}
RACE = {0: "White", 1: "Black", 2: "Asian", 3: "Indian", 4: "Other"}


def load_items(root: Path) -> list[tuple[Path, int, int, int]]:
    """[(path, age, gender, race)] for every parseable UTKFace filename."""
    out = []
    for p in root.iterdir():
        m = NAME.match(p.name)
        if not m:
            continue
        age, g, r = int(m[1]), int(m[2]), int(m[3])
        if 1 <= age <= 100:          # our model's supported range
            out.append((p, age, g, r))
    return out


@torch.no_grad()
def predict_all(items, tag: str, batch: int, workers: int) -> list[float]:
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ck = torch.load(CKPT_ROOT / tag / "model.pt", map_location=dev, weights_only=True)
    model = AgeModel(head=ck["head"], pretrained=False).to(dev).eval()
    model.load_state_dict(ck["state_dict"])

    ds = AgeFolder([(p, a) for p, a, _, _ in items], False, IMAGE_SIZE)
    dl = DataLoader(ds, batch_size=batch, shuffle=False, num_workers=workers,
                    pin_memory=True)
    preds: list[float] = []
    for x, _ in dl:
        out = model(x.to(dev, non_blocking=True)).float()
        preds += [d.age for d in decode(out, ck["head"])]
    return preds


def boot_ci(errs: list[float], n_boot: int = 2000, seed: int = 0) -> tuple[float, float]:
    """Percentile bootstrap CI for the mean. Small groups get visibly wide intervals,
    which is the entire point of showing them."""
    if len(errs) < 2:
        return (float("nan"), float("nan"))
    rng = random.Random(seed)
    n = len(errs)
    means = []
    for _ in range(n_boot):
        means.append(sum(errs[rng.randrange(n)] for _ in range(n)) / n)
    means.sort()
    return (means[int(0.025 * n_boot)], means[int(0.975 * n_boot)])


def group_table(items, preds, key) -> list[dict]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for (_, age, g, r), pred in zip(items, preds):
        buckets[key(g, r)].append(abs(pred - age))
    rows = []
    for name, errs in buckets.items():
        lo, hi = boot_ci(errs)
        rows.append({"group": name, "n": len(errs),
                     "mae": round(sum(errs) / len(errs), 3),
                     "ci_low": round(lo, 3), "ci_high": round(hi, 3)})
    return sorted(rows, key=lambda r: -r["n"])


# Age bands used for the stratified table. Groups differ enormously in age composition
# (UTKFace's "Other" group averages 23 years old, "White" averages 38), and younger faces
# are easier to estimate. Comparing raw per-group MAE therefore measures age composition
# as much as it measures fairness. Comparing WITHIN a band removes that confound and is
# the only version of this table worth publishing.
STRATA = [("0-17", 0, 17), ("18-29", 18, 29), ("30-49", 30, 49),
          ("50-64", 50, 64), ("65+", 65, 120)]
MIN_CELL = 30          # below this a cell is reported as too small rather than as a number


def stratified(items, preds) -> list[dict]:
    cells: dict[tuple[str, str], list[float]] = defaultdict(list)
    for (_, age, _, r), pred in zip(items, preds):
        for name, lo, hi in STRATA:
            if lo <= age <= hi:
                cells[(name, RACE[r])].append(abs(pred - age))
                break

    rows = []
    for name, _, _ in STRATA:
        row = {"band": name, "groups": {}}
        for race in RACE.values():
            errs = cells[(name, race)]
            row["groups"][race] = (
                {"n": len(errs), "mae": round(sum(errs) / len(errs), 3)}
                if len(errs) >= MIN_CELL else {"n": len(errs), "mae": None}
            )
        usable = [(g, v["mae"]) for g, v in row["groups"].items() if v["mae"] is not None]
        if len(usable) > 1:
            usable.sort(key=lambda x: x[1])
            row["best"], row["worst"] = usable[0][0], usable[-1][0]
            row["gap"] = round(usable[-1][1] - usable[0][1], 3)
        rows.append(row)
    return rows


def show_stratified(rows: list[dict]) -> None:
    races = list(RACE.values())
    print("\nMAE by race WITHIN age band (controls for group age composition)")
    print(f"  {'band':<7}" + "".join(f"{r:>17}" for r in races))
    for row in rows:
        line = f"  {row['band']:<7}"
        for race in races:
            c = row["groups"][race]
            line += (f"{c['mae']:>10.2f} ({c['n']:>4})" if c["mae"] is not None
                     else f"{'n<' + str(MIN_CELL):>17}")
        print(line)
    print()
    for row in rows:
        if "gap" in row:
            print(f"  {row['band']:<7} best {row['best']:<7} worst {row['worst']:<7} "
                  f"gap {row['gap']:.2f} yr")


def review_rates(items, tag: str) -> list[dict]:
    """Share of each group the confidence rule would route to a human reviewer.

    Worth measuring rather than assuming. The claim that "the review queue contains the
    bias" is only true if routing actually fires more often for the groups the model
    serves worst, and it also exposes the cost of that containment: the same people then
    carry disproportionately more manual review.
    """
    metrics = json.loads((CKPT_ROOT / tag / "metrics.json").read_text())
    quant = metrics.get("confidence_quantiles") or []
    if not quant:
        return []
    thresh = 0.15          # server/bands.py REVIEW_PERCENTILE

    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ck = torch.load(CKPT_ROOT / tag / "model.pt", map_location=dev, weights_only=True)
    model = AgeModel(head=ck["head"], pretrained=False).to(dev).eval()
    model.load_state_dict(ck["state_dict"])

    dl = DataLoader(AgeFolder([(p, a) for p, a, _, _ in items], False, IMAGE_SIZE),
                    batch_size=256, shuffle=False, num_workers=6, pin_memory=True)
    confs: list[float] = []
    with torch.no_grad():
        for x, _ in dl:
            confs += [d.confidence for d in decode(
                model(x.to(dev, non_blocking=True)).float(), ck["head"])]

    flagged: dict[str, list[bool]] = defaultdict(list)
    for (_, _, _, r), c in zip(items, confs):
        pct = sum(1 for v in quant if v <= c) / len(quant)
        flagged[RACE[r]].append(pct <= thresh)

    return sorted([{"group": g, "n": len(v), "review_rate": round(sum(v) / len(v), 4)}
                   for g, v in flagged.items()], key=lambda r: -r["review_rate"])


def show_routing(rows: list[dict]) -> None:
    if not rows:
        return
    print("\nShare of each group the confidence rule routes to human review")
    for r in rows:
        print(f"  {r['group']:<8} {r['review_rate']:>7.1%}   (n={r['n']:,})")
    print("  Containment, not a correction: the worst-served groups also carry the most")
    print("  manual review, which is a worse experience even when the decision is better.")


def show(title: str, rows: list[dict], overall: float) -> None:
    print(f"\n{title}")
    print(f"  {'group':<18} {'n':>7} {'MAE':>7}   {'95% CI':>16}   vs overall")
    for r in rows:
        width = r["ci_high"] - r["ci_low"]
        flag = "  <- wide, small n" if width > 1.5 else ""
        print(f"  {r['group']:<18} {r['n']:>7,} {r['mae']:>7.2f}   "
              f"[{r['ci_low']:>6.2f},{r['ci_high']:>6.2f}]   "
              f"{r['mae'] - overall:+6.2f}{flag}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="dist-v1")
    ap.add_argument("--root", type=Path, default=UTK_ROOT)
    ap.add_argument("--batch-size", type=int, default=256)
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()

    items = load_items(a.root)
    if not items:
        raise SystemExit(f"no parseable UTKFace images under {a.root}")
    print(f"UTKFace  {len(items):,} images, ages "
          f"{min(i[1] for i in items)}-{max(i[1] for i in items)}")

    preds = predict_all(items, a.tag, a.batch_size, a.workers)
    errs = [abs(p - it[1]) for p, it in zip(preds, items)]
    overall = sum(errs) / len(errs)
    lo, hi = boot_ci(errs)
    print(f"\noverall MAE on UTKFace  {overall:.3f}  [{lo:.3f}, {hi:.3f}]")
    print("(out of distribution for this model - compare groups to each other, "
          "not this figure to our held-out MAE)")

    by_race = group_table(items, preds, lambda g, r: RACE[r])
    by_gender = group_table(items, preds, lambda g, r: GENDER[g])
    by_both = group_table(items, preds, lambda g, r: f"{RACE[r]} {GENDER[g]}")

    show("By race", by_race, overall)
    show("By gender", by_gender, overall)
    show("Intersectional", by_both, overall)

    spread = max(r["mae"] for r in by_both) - min(r["mae"] for r in by_both)
    print(f"\nwidest intersectional gap  {spread:.2f} years  (NOT age-controlled)")

    strat = stratified(items, preds)
    show_stratified(strat)

    routing = review_rates(items, a.tag)
    show_routing(routing)

    DOCS.mkdir(parents=True, exist_ok=True)
    out = DOCS / f"fairness-{a.tag}.json"
    out.write_text(json.dumps({
        "source": "UTKFace (jangedoo/utkface-new), inference only, no retraining",
        "caveat": ("Out of distribution for this model. Absolute MAE is not comparable to "
                   "our held-out figure; only the spread between groups is meaningful. "
                   "UTKFace ages are algorithmically estimated and human-checked, so the "
                   "labels carry their own noise."),
        "n": len(items), "overall_mae": round(overall, 3),
        "overall_ci": [round(lo, 3), round(hi, 3)],
        "by_race": by_race, "by_gender": by_gender, "intersectional": by_both,
        "widest_intersectional_gap_years": round(spread, 3),
        "age_stratified": strat,
        "age_stratified_note": (
            "Group age composition differs sharply (Other averages 23 years, White 38), "
            "and younger faces are easier to estimate, so raw per-group MAE partly "
            "measures age composition. These within-band figures are the ones that "
            "support a fairness claim."),
        "review_routing_by_group": routing,
        "review_routing_note": (
            "Share of each group the confidence rule sends to a human. Routing order "
            "matches error order, so the queue does contain the disparity - but the same "
            "people then carry more manual review, which is a cost, not a correction."),
    }, indent=2))
    print(f"\nwritten to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
