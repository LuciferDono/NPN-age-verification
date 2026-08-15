"""GATE 0 — dataset ground truth. Run this before writing any training code.

The Kaggle page for `mariafrenti/age-prediction` is JS-rendered and could not be read;
its description claims ages 1-100 while a public repo trained on a 20-50 subset. That
gap decides which band set is clinically defensible, so it gets measured, not assumed.

    python ml/gate0.py data/

Outputs a JSON report to ml/gate0_report.json and prints the decision.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
REPORT = Path(__file__).with_name("gate0_report.json")

# Age may be encoded as a folder name ("34/img.jpg") or in the filename
# ("34_0_1_2017.jpg", UTKFace style). Try folder first, then filename prefix.
FNAME_AGE = re.compile(r"^(\d{1,3})[_\-.]")


def age_of(path: Path, root: Path) -> int | None:
    for part in reversed(path.relative_to(root).parts[:-1]):
        if part.isdigit():
            return int(part)
    m = FNAME_AGE.match(path.name)
    return int(m.group(1)) if m else None


def scan(root: Path) -> dict:
    images = [p for p in root.rglob("*") if p.suffix.lower() in IMAGE_EXT]
    ages = Counter()
    unlabelled = 0
    for p in images:
        a = age_of(p, root)
        if a is None or not (0 <= a <= 120):
            unlabelled += 1
        else:
            ages[a] += 1

    if not ages:
        return {"error": "no age labels recovered", "total_images": len(images),
                "unlabelled": unlabelled,
                "layout": sorted({str(p.parent.relative_to(root)) for p in images[:200]})[:20]}

    keys = sorted(ages)
    total = sum(ages.values())
    per_decade = Counter((a // 10) * 10 for a in ages.elements())

    return {
        "total_images": len(images),
        "labelled": total,
        "unlabelled": unlabelled,
        "distinct_ages": len(keys),
        "age_min": keys[0],
        "age_max": keys[-1],
        "counts_by_age": {str(k): ages[k] for k in keys},
        "counts_by_decade": {str(k): per_decade[k] for k in sorted(per_decade)},
        "under_18": sum(v for k, v in ages.items() if k < 18),
        "over_64": sum(v for k, v in ages.items() if k > 64),
        "top_level_dirs": sorted({p.parts[0] for p in
                                  (q.relative_to(root) for q in root.iterdir())}),
    }


def decide(r: dict) -> dict:
    """Which band set is defensible, and is the review queue load-bearing."""
    if "error" in r:
        return {"band_set": None, "reason": r["error"]}

    total = r["labelled"]
    minors, elders = r["under_18"], r["over_64"]
    thin = 0.02 * total  # <2% of the set is not enough to claim a clinical band

    lifespan = minors >= thin and elders >= thin
    tails_sparse = (0 < minors < thin) or (0 < elders < thin)

    return {
        "band_set": "lifespan" if lifespan else "adult_only",
        "reason": (
            f"under-18 n={minors} ({minors / total:.1%}), over-64 n={elders} "
            f"({elders / total:.1%}); threshold {thin:.0f} (2% of {total})."
        ),
        "claim_paediatric": bool(lifespan),
        "per_band_mae_mandatory": bool(tails_sparse or lifespan),
        "note": (
            "Set ACTIVE_BAND_SET in server/bands.py to this value. If tails are sparse, "
            "MAE is non-uniform across bands: report per-band MAE and say so on the slide."
        ),
    }


CENSUS = Path(__file__).with_name("dataset_census.json")


def from_census(split: str = "train") -> dict:
    """Build the same report shape from Kaggle's authoritative file-tree counts.

    Kaggle's API reports per-age file counts directly, so the band decision can be made
    before downloading 2.16 GB. `scan()` on the extracted data remains the ground truth —
    this is the same measurement, taken earlier.
    """
    census = json.loads(CENSUS.read_text())
    counts = {int(k): v for k, v in census["counts_by_age"][split].items()}
    keys = sorted(counts)
    per_decade: Counter = Counter()
    for a, n in counts.items():
        per_decade[(a // 10) * 10] += n

    return {
        "source": f"census:{split}",
        "total_images": sum(counts.values()),
        "labelled": sum(counts.values()),
        "unlabelled": 0,
        "distinct_ages": len(keys),
        "age_min": keys[0],
        "age_max": keys[-1],
        "counts_by_age": {str(k): counts[k] for k in keys},
        "counts_by_decade": {str(k): per_decade[k] for k in sorted(per_decade)},
        "under_18": sum(v for k, v in counts.items() if k < 18),
        "over_64": sum(v for k, v in counts.items() if k > 64),
        "top_level_dirs": [census["trees"]["full_lifespan"]["root"]],
    }


def main() -> int:
    arg = sys.argv[1] if len(sys.argv) > 1 else "data"

    if arg == "--census":
        report = from_census("train")
        report["decision"] = decide(report)
        REPORT.write_text(json.dumps(report, indent=2))
        _print(report, "census (Kaggle file tree, no download)")
        return 0

    root = Path(arg)
    if not root.is_dir():
        print(f"not a directory: {root}\nusage: python ml/gate0.py <dataset_root> | --census")
        return 2

    report = scan(root)
    report["decision"] = decide(report)
    REPORT.write_text(json.dumps(report, indent=2))
    if "error" in report:
        print(f"\n--- GATE 0 · {root} ---\nFAILED: {report['error']}")
        print("layout sample:", report.get("layout"))
        return 1
    _print(report, str(root))
    return 0


def _print(report: dict, label: str) -> None:
    print(f"\n--- GATE 0 · {label} ---")
    print(f"images         {report['total_images']} ({report['unlabelled']} unlabelled)")
    print(f"age range      {report['age_min']} - {report['age_max']} "
          f"({report['distinct_ages']} distinct)")
    print(f"under 18       {report['under_18']}")
    print(f"over 64        {report['over_64']}")
    print("by decade      " + "  ".join(f"{k}s:{v}" for k, v in
                                        report["counts_by_decade"].items()))
    d = report["decision"]
    print(f"\nBAND SET  ->   {d['band_set']}")
    print(f"because        {d['reason']}")
    print(f"per-band MAE   {'MANDATORY' if d['per_band_mae_mandatory'] else 'optional'}")
    print(f"\nreport written to {REPORT}")


def _selfcheck() -> None:
    """Run: python ml/gate0.py --selfcheck"""
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        # adult-only shape: 20-50 only
        for age in range(20, 51):
            d = root / str(age)
            d.mkdir(parents=True)
            for i in range(10):
                (d / f"{i}.jpg").write_bytes(b"x")
        r = scan(root)
        assert r["age_min"] == 20 and r["age_max"] == 50, r
        assert r["labelled"] == 310
        assert decide(r)["band_set"] == "adult_only"
        assert decide(r)["claim_paediatric"] is False

    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        # lifespan shape: plenty of minors and elders
        for age in (5, 10, 25, 40, 70, 80):
            d = root / str(age)
            d.mkdir(parents=True)
            for i in range(50):
                (d / f"{i}.jpg").write_bytes(b"x")
        r = scan(root)
        assert decide(r)["band_set"] == "lifespan", decide(r)
        assert r["under_18"] == 100 and r["over_64"] == 100

    with tempfile.TemporaryDirectory() as td:
        # UTKFace-style filenames, flat dir
        root = Path(td)
        for age in (22, 33, 44):
            (root / f"{age}_0_1_2017.jpg").write_bytes(b"x")
        r = scan(root)
        assert r["labelled"] == 3 and r["age_min"] == 22, r

    print("gate0.py selfcheck OK")


if __name__ == "__main__":
    if "--selfcheck" in sys.argv:
        _selfcheck()
    else:
        raise SystemExit(main())
