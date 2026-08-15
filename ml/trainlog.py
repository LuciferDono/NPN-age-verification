"""Record training history to disk as it happens, and render it for the deck.

    python -m ml.trainlog --watch dist-v1     # poll the live run, append each new epoch
    python -m ml.trainlog --render dist-v1    # write the curve + a markdown table

Python buffers stdout when it is redirected, so a long run's per-epoch lines are stuck
in a pipe until it ends — and if the process dies, they are gone. The checkpoint is
written every time validation improves and carries its own epoch and val MAE, so polling
it reconstructs the history from durable state instead.

The artifacts here are demo material: a panel asks "how do you know it learned?" and a
curve answers in one second. They also outlive the event, which is the point.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

CKPT_ROOT = Path(__file__).resolve().parent.parent / "checkpoints"
DOCS = Path(__file__).resolve().parent.parent / "docs"
BASELINE_MAE = 11.336  # mean-age predictor on the held-out test split


def history_path(tag: str) -> Path:
    return CKPT_ROOT / tag / "history.json"


def read_checkpoint(tag: str) -> dict | None:
    import torch  # local: the renderer should work without a GPU stack

    p = CKPT_ROOT / tag / "model.pt"
    if not p.exists():
        return None
    try:
        ck = torch.load(p, map_location="cpu", weights_only=True)
    except Exception:
        return None  # mid-write; the next poll will catch it
    return {"epoch": int(ck["epoch"]), "val_mae": float(ck["val_mae"])}


def watch(tag: str, poll: int = 45) -> int:
    """Append each newly saved epoch to history.json until metrics.json appears."""
    hist_p = history_path(tag)
    hist = json.loads(hist_p.read_text()) if hist_p.exists() else []
    seen = {h["epoch"] for h in hist}
    done = CKPT_ROOT / tag / "metrics.json"
    t0 = time.time()

    print(f"watching {tag} (poll {poll}s) — ctrl-c to stop")
    while True:
        cur = read_checkpoint(tag)
        if cur and cur["epoch"] not in seen:
            # Minutes since this recorder attached, not since training began — the
            # recorder can join a run already in progress, and a column that silently
            # means two different things is worse than one that is explicit.
            cur["watch_min"] = round((time.time() - t0) / 60, 1)
            hist.append(cur)
            seen.add(cur["epoch"])
            hist_p.parent.mkdir(parents=True, exist_ok=True)
            hist_p.write_text(json.dumps(hist, indent=2))
            print(f"  epoch {cur['epoch']:02d}  val MAE {cur['val_mae']:.3f}", flush=True)
        if done.exists():
            print("metrics.json present — run finished")
            return 0
        time.sleep(poll)


EPOCH_RE = re.compile(
    r"epoch\s+(\d+)\s+val MAE\s+([\d.]+)\s+CS@5\s+([\d.]+)\s+band\s+([\d.]+)\s+\((\d+)s\)")


def from_log(tag: str, log: Path) -> int:
    """Rebuild history.json from a training log — every epoch, not just the saved ones.

    The checkpoint only records epochs that improved, so a curve built from it silently
    omits the regressions. The log has all of them, and a curve that hides its own bumps
    is the kind of thing a panel is right to distrust. Handles UTF-16, which is what
    PowerShell's Tee-Object writes by default.
    """
    raw = log.read_bytes()
    text = raw.decode("utf-16" if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else "utf-8",
                      errors="replace")
    hist = [
        {"epoch": int(m[0]), "val_mae": float(m[1]), "cs5": float(m[2]),
         "band_accuracy": float(m[3]), "epoch_sec": int(m[4])}
        for m in EPOCH_RE.findall(text)
    ]
    if not hist:
        print(f"no epoch lines found in {log}")
        return 2

    p = history_path(tag)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(hist, indent=2))
    best = min(hist, key=lambda h: h["val_mae"])
    print(f"recovered {len(hist)} epochs -> {p}")
    print(f"best: epoch {best['epoch']} val MAE {best['val_mae']:.3f}")
    return 0


def render(tag: str) -> int:
    """Write docs/training-<tag>.svg and docs/training-<tag>.md from history + metrics."""
    hist_p = history_path(tag)
    if not hist_p.exists():
        print(f"no history at {hist_p}")
        return 2
    hist = json.loads(hist_p.read_text())
    metrics_p = CKPT_ROOT / tag / "metrics.json"
    metrics = json.loads(metrics_p.read_text()) if metrics_p.exists() else {}

    DOCS.mkdir(parents=True, exist_ok=True)
    svg_p, md_p = DOCS / f"training-{tag}.svg", DOCS / f"training-{tag}.md"
    svg_p.write_text(_svg(hist))
    md_p.write_text(_markdown(tag, hist, metrics))
    print(f"wrote {svg_p}\nwrote {md_p}")
    return 0


def _svg(hist: list[dict], w: int = 720, h: int = 300) -> str:
    """Validation curve against the baseline. Clinical paper palette, no gradients."""
    pad_l, pad_r, pad_t, pad_b = 54, 16, 18, 34
    pw, ph = w - pad_l - pad_r, h - pad_t - pad_b
    xs = [p["epoch"] for p in hist]
    ys = [p["val_mae"] for p in hist]
    y_hi = max(BASELINE_MAE, max(ys)) * 1.05
    y_lo = min(ys) * 0.90

    def X(e: int) -> float:
        return pad_l + (pw if len(xs) == 1 else pw * (e - xs[0]) / (xs[-1] - xs[0]))

    def Y(v: float) -> float:
        return pad_t + ph * (1 - (v - y_lo) / (y_hi - y_lo))

    grid, labels = [], []
    steps = 5
    for i in range(steps + 1):
        v = y_lo + (y_hi - y_lo) * i / steps
        y = Y(v)
        grid.append(f'<line x1="{pad_l}" y1="{y:.1f}" x2="{w - pad_r}" y2="{y:.1f}" '
                    f'stroke="#dedbd2" stroke-width="1"/>')
        labels.append(f'<text x="{pad_l - 8}" y="{y + 3.5:.1f}" text-anchor="end" '
                      f'font-family="IBM Plex Mono, monospace" font-size="10" '
                      f'fill="#8b918b">{v:.1f}</text>')

    pts = " ".join(f"{X(p['epoch']):.1f},{Y(p['val_mae']):.1f}" for p in hist)
    dots = "".join(f'<circle cx="{X(p["epoch"]):.1f}" cy="{Y(p["val_mae"]):.1f}" r="2.5" '
                   f'fill="#23282a"/>' for p in hist)
    xlab = "".join(
        f'<text x="{X(p["epoch"]):.1f}" y="{h - pad_b + 16}" text-anchor="middle" '
        f'font-family="IBM Plex Mono, monospace" font-size="10" fill="#8b918b">'
        f'{p["epoch"]}</text>'
        for p in hist if len(hist) <= 14 or p["epoch"] % 2 == 0)

    base_y = Y(BASELINE_MAE)
    best = min(hist, key=lambda p: p["val_mae"])

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
<rect width="{w}" height="{h}" fill="#f4f3ef"/>
{"".join(grid)}
{"".join(labels)}
<line x1="{pad_l}" y1="{base_y:.1f}" x2="{w - pad_r}" y2="{base_y:.1f}"
      stroke="#a2412f" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="{w - pad_r}" y="{base_y - 7:.1f}" text-anchor="end"
      font-family="Instrument Sans, sans-serif" font-size="10" fill="#a2412f">
  mean-age baseline {BASELINE_MAE:.2f}</text>
<polyline points="{pts}" fill="none" stroke="#23282a" stroke-width="2"
          stroke-linejoin="round"/>
{dots}
<circle cx="{X(best['epoch']):.1f}" cy="{Y(best['val_mae']):.1f}" r="5" fill="none"
        stroke="#b06a12" stroke-width="2"/>
<text x="{X(best['epoch']):.1f}" y="{Y(best['val_mae']) - 12:.1f}" text-anchor="middle"
      font-family="IBM Plex Mono, monospace" font-size="11" fill="#b06a12">
  {best['val_mae']:.2f}</text>
{xlab}
<text x="{pad_l}" y="{h - 6}" font-family="Instrument Sans, sans-serif" font-size="10"
      fill="#5c635f">epoch</text>
<text x="14" y="{pad_t + 4}" font-family="Instrument Sans, sans-serif" font-size="10"
      fill="#5c635f" transform="rotate(-90 14 {pad_t + 4})">validation MAE (years)</text>
</svg>'''


def _markdown(tag: str, hist: list[dict], metrics: dict) -> str:
    best = min(hist, key=lambda p: p["val_mae"])
    lines = [
        f"# Training run `{tag}`", "",
        f"![validation curve](training-{tag}.svg)", "",
        "## Validation MAE by epoch", "",
        "| epoch | val MAE (yr) | vs baseline | elapsed (min) |",
        "|---:|---:|---:|---:|",
    ]
    for p in hist:
        mark = " **best**" if p["epoch"] == best["epoch"] else ""
        lines.append(f"| {p['epoch']}{mark} | {p['val_mae']:.3f} | "
                     f"−{(1 - p['val_mae'] / BASELINE_MAE) * 100:.0f}% | "
                     f"{p.get('watch_min', p.get('elapsed_min', '—'))} |")

    if metrics:
        t = metrics.get("test", {})
        lines += ["", "## Held-out test split", "",
                  f"- **MAE** {t.get('mae', float('nan')):.3f} yr "
                  f"(baseline {t.get('baseline_mae', float('nan')):.3f})",
                  f"- **CS@5** {t.get('cs5', 0) * 100:.1f}% within 5 years",
                  f"- **Band accuracy** {t.get('band_accuracy', 0) * 100:.1f}%",
                  f"- n = {t.get('n', 0):,}", "",
                  "### Per-band MAE", "",
                  "| band | n | MAE (yr) |", "|---|---:|---:|"]
        for r in t.get("per_band_mae", []):
            mae = f"{r['mae']:.2f}" if r.get("mae") is not None else "—"
            lines.append(f"| {r['band']} | {r['n']:,} | {mae} |")

        v = metrics.get("queue_verdict", {})
        if v:
            lines += ["", "### Review-queue verdict "
                          f"({'PASS' if v.get('passed') else 'FAIL'})", "",
                      f"Bottom/top confidence-decile MAE ratio "
                      f"**{v.get('bottom_top_mae_ratio')}×** "
                      f"(threshold {v['thresholds']['ratio_min']}×), monotonic "
                      f"**{v.get('monotonic_fraction')}** "
                      f"(threshold {v['thresholds']['monotonic_min']}).", "",
                      f"> {v.get('claim', '')}"]
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--watch", metavar="TAG")
    ap.add_argument("--render", metavar="TAG")
    ap.add_argument("--from-log", nargs=2, metavar=("TAG", "LOG"))
    ap.add_argument("--poll", type=int, default=45)
    a = ap.parse_args()
    if a.from_log:
        return from_log(a.from_log[0], Path(a.from_log[1]))
    if a.watch:
        return watch(a.watch, a.poll)
    if a.render:
        return render(a.render)
    ap.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
