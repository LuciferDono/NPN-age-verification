"""Dataset, splits and transforms for the age folders.

Layout (from ml/dataset_census.json — verified against Kaggle's file tree):

    data/age_prediction_up/age_prediction/
        train/001 … train/100      185,632 images
        test/001  … test/100        47,568 images

The published test split is held out and never touched during training. The validation
set used for early stopping, calibration and the confidence percentiles is carved out of
train, stratified by age so the sparse tails (13 images at age 95) are represented in
both halves rather than landing entirely in one.
"""

from __future__ import annotations

import random
import sys
from collections import defaultdict
from pathlib import Path

import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms

from .model import IMAGE_SIZE, MAX_AGE, MIN_AGE

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
DEFAULT_ROOT = Path("data/age_prediction_up/age_prediction")

# ImageNet statistics — the backbone is pretrained on it.
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


def find_items(split_dir: Path) -> list[tuple[Path, int]]:
    """[(path, age)] for one split. Age comes from the folder name ('034' -> 34)."""
    items: list[tuple[Path, int]] = []
    for folder in sorted(split_dir.iterdir()):
        if not folder.is_dir() or not folder.name.isdigit():
            continue
        age = int(folder.name)
        if not MIN_AGE <= age <= MAX_AGE:
            continue
        for p in folder.iterdir():
            if p.suffix.lower() in IMAGE_EXT:
                items.append((p, age))
    return items


def stratified_split(
    items: list[tuple[Path, int]], val_frac: float = 0.1, seed: int = 1337
) -> tuple[list[tuple[Path, int]], list[tuple[Path, int]]]:
    """Split per age, so every age contributes to both halves.

    A global shuffle would put entire sparse ages (n=3 at age 98) wholly in one side,
    which makes per-band validation numbers meaningless exactly where they matter most.
    """
    by_age: dict[int, list[tuple[Path, int]]] = defaultdict(list)
    for it in items:
        by_age[it[1]].append(it)

    rng = random.Random(seed)
    train: list[tuple[Path, int]] = []
    val: list[tuple[Path, int]] = []
    for age in sorted(by_age):
        group = sorted(by_age[age])          # sort first: filesystem order is not stable
        rng.shuffle(group)
        # at least one val sample per age whenever the age has more than one image
        n_val = max(1, round(len(group) * val_frac)) if len(group) > 1 else 0
        val.extend(group[:n_val])
        train.extend(group[n_val:])
    return train, val


def build_transforms(train: bool, size: int = IMAGE_SIZE):
    """Transforms for the 128x128 pre-cropped source images.

    The source is already a tight face crop, so the usual Resize-then-CenterCrop eval
    pipeline is wrong here: it would discard the outer ~12% of the frame, which on this
    data is chin and hairline — both load-bearing for age. Resize the whole frame instead,
    and keep the training crop conservative for the same reason.
    """
    if train:
        return transforms.Compose([
            transforms.RandomResizedCrop(size, scale=(0.85, 1.0), ratio=(0.95, 1.05)),
            transforms.RandomHorizontalFlip(),
            # Mild only. Heavy colour jitter teaches the model that skin tone is noise,
            # which is the wrong lesson for a system already weak on demographic fairness.
            transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.10),
            transforms.ToTensor(),
            transforms.Normalize(MEAN, STD),
            transforms.RandomErasing(p=0.20, scale=(0.02, 0.10)),
        ])
    return transforms.Compose([
        transforms.Resize((size, size)),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])


class AgeFolder(Dataset):
    def __init__(self, items: list[tuple[Path, int]], train: bool, size: int = IMAGE_SIZE):
        self.items = items
        self.tf = build_transforms(train, size)

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, i: int):
        path, age = self.items[i]
        try:
            img = Image.open(path).convert("RGB")
        except Exception:
            # A handful of corrupt files in a 233k-image dump must not kill a 3-hour run.
            img = Image.new("RGB", (IMAGE_SIZE, IMAGE_SIZE), (128, 128, 128))
        return self.tf(img), torch.tensor(float(age))


def loaders(root: Path = DEFAULT_ROOT, batch_size: int = 96, workers: int = 8,
            val_frac: float = 0.1, limit_per_age: int | None = None,
            size: int = IMAGE_SIZE):
    """train/val/test DataLoaders. `limit_per_age` caps samples per age for smoke runs."""
    train_items = find_items(root / "train")
    test_items = find_items(root / "test")
    if not train_items:
        raise SystemExit(f"no images under {root / 'train'} — is the dataset extracted?")

    if limit_per_age:
        by_age: dict[int, list] = defaultdict(list)
        for it in train_items:
            by_age[it[1]].append(it)
        train_items = [it for age in sorted(by_age) for it in by_age[age][:limit_per_age]]

    tr, va = stratified_split(train_items, val_frac)
    common = dict(num_workers=workers, pin_memory=True,
                  persistent_workers=workers > 0, drop_last=False)
    return (
        DataLoader(AgeFolder(tr, True, size), batch_size=batch_size, shuffle=True, **common),
        DataLoader(AgeFolder(va, False, size), batch_size=batch_size * 2, shuffle=False,
                   **common),
        DataLoader(AgeFolder(test_items, False, size), batch_size=batch_size * 2,
                   shuffle=False, **common),
    )


def inspect(root: Path = DEFAULT_ROOT, n: int = 40) -> None:
    """Are the images already face-cropped? Decides whether we add a detector.

    Pre-cropped face datasets are near-square and small. If that is what we have,
    bolting a Haar detector onto training is wasted work and can crop into the face.
    """
    items = find_items(root / "train")
    if not items:
        raise SystemExit(f"no images under {root / 'train'}")
    rng = random.Random(0)
    sample = rng.sample(items, min(n, len(items)))

    sizes, ratios = [], []
    for p, _ in sample:
        with Image.open(p) as im:
            w, h = im.size
        sizes.append((w, h))
        ratios.append(w / h)

    ws = sorted(w for w, _ in sizes)
    hs = sorted(h for _, h in sizes)
    ratios.sort()
    mid = len(sample) // 2
    square = sum(1 for r in ratios if 0.9 <= r <= 1.11)

    print(f"sampled        {len(sample)} images from {len(items):,}")
    print(f"width          min {ws[0]}  median {ws[mid]}  max {ws[-1]}")
    print(f"height         min {hs[0]}  median {hs[mid]}  max {hs[-1]}")
    print(f"aspect ratio   min {ratios[0]:.2f}  median {ratios[mid]:.2f}  max {ratios[-1]:.2f}")
    print(f"near-square    {square}/{len(sample)}")
    print(f"example        {sample[0][0]}")
    print()
    if square >= 0.8 * len(sample) and ws[mid] <= 400:
        print("VERDICT  already face-cropped -> do NOT add a detector to training.")
    else:
        print("VERDICT  full scenes -> face crop is worth adding before training.")


def _selfcheck() -> None:
    """Run: python -m ml.data --selfcheck  (no dataset needed)"""
    items = [(Path(f"{age:03d}/{i}.jpg"), age)
             for age in (5, 30, 98) for i in range(({5: 20, 30: 100, 98: 3})[age])]
    tr, va = stratified_split(items, val_frac=0.1, seed=1)

    assert len(tr) + len(va) == len(items), "split must be lossless"
    assert not (set(tr) & set(va)), "no leakage between train and val"

    ages_val = {a for _, a in va}
    assert ages_val == {5, 30, 98}, f"every age must appear in val, got {ages_val}"

    # sparse age (n=3) still contributes exactly one val sample
    assert sum(1 for _, a in va if a == 98) == 1

    # deterministic for a fixed seed
    assert stratified_split(items, 0.1, 1)[1] == va, "seeded split must be reproducible"

    assert build_transforms(True) is not None and build_transforms(False) is not None
    print("data.py selfcheck OK")


if __name__ == "__main__":
    if "--selfcheck" in sys.argv:
        _selfcheck()
    elif "--inspect" in sys.argv:
        inspect(Path(sys.argv[-1]) if len(sys.argv) > 2 else DEFAULT_ROOT)
    else:
        print("usage: python -m ml.data [--selfcheck | --inspect [root]]")
