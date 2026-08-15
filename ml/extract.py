"""Extract only the tree we train on, resumably.

    python -m ml.extract

The archive carries two independent trees. `20-50/` is a 40,440-file subset of the same
photos we already get from `age_prediction_up/`, so extracting it costs I/O and disk for
files nothing opens. Unpacking 233k small files onto NTFS is the slowest step in the whole
build, so it skips anything already on disk and can be re-run after an interruption.
"""

from __future__ import annotations

import sys
import time
import zipfile
from pathlib import Path

ARCHIVE = Path("age-prediction.zip")
WANTED = "age_prediction_up/"
DEST = Path("data")


def safe_target(name: str, dest_root: Path) -> Path:
    """Resolve an archive member under dest_root, refusing anything that escapes it.

    A zip member name is attacker-controlled data, not a path we chose: '../' segments or
    an absolute name would otherwise write outside the destination (Zip Slip). This
    archive is from Kaggle and benign, but the check costs nothing and the script is
    committed for reuse.
    """
    parts = Path(name).parts
    if name.startswith(("/", "\\")) or ".." in parts or (len(parts) > 1 and ":" in parts[0]):
        raise RuntimeError(f"unsafe path in archive: {name!r}")
    target = (dest_root / name).resolve()
    try:
        target.relative_to(dest_root)
    except ValueError:
        raise RuntimeError(f"unsafe path in archive: {name!r}") from None
    return target


def main() -> int:
    if not ARCHIVE.exists():
        print(f"missing {ARCHIVE}")
        return 2

    z = zipfile.ZipFile(ARCHIVE)
    members = [i for i in z.infolist() if i.filename.startswith(WANTED) and not i.is_dir()]
    total = len(members)
    print(f"extracting {total:,} files from {WANTED} -> {DEST}/")

    dest_root = DEST.resolve()
    t0 = time.time()
    done = skipped = 0
    for i, info in enumerate(members, 1):
        target = safe_target(info.filename, dest_root)
        if target.exists() and target.stat().st_size == info.file_size:
            skipped += 1
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as src, open(target, "wb") as dst:
                dst.write(src.read())
            done += 1

        if i % 10_000 == 0 or i == total:
            el = time.time() - t0
            rate = i / el if el else 0
            eta = (total - i) / rate if rate else 0
            print(f"  {i:>7,}/{total:,}  {rate:>6.0f} files/s  eta {eta / 60:4.1f} min",
                  flush=True)

    print(f"\nwrote {done:,}, skipped {skipped:,} already present, in "
          f"{(time.time() - t0) / 60:.1f} min")
    return 0


def _selfcheck() -> None:
    """Run: python -m ml.extract --selfcheck"""
    root = Path("data").resolve()
    assert safe_target("age_prediction_up/train/001/a.jpg", root).is_relative_to(root)
    for bad in ("../evil.py", "age_prediction_up/../../evil.py", "/etc/passwd",
                "C:/Windows/evil.dll", "..\\evil.py"):
        try:
            safe_target(bad, root)
        except RuntimeError:
            continue
        raise AssertionError(f"escaped the destination: {bad!r}")
    print("extract.py selfcheck OK")


if __name__ == "__main__":
    import sys
    raise SystemExit(_selfcheck() if "--selfcheck" in sys.argv else main())
