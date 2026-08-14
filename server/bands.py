"""Age bands, policy decisions, and review routing.

Single source of truth for banding. Gate 0 (actual dataset age distribution) decides
which BAND_SET is active — see ml/gate0.py. Nothing else in the codebase may hardcode
an age boundary.
"""

from __future__ import annotations

# Bottom 15% of validation-set confidence routes to manual review.
# Percentile, not a raw confidence cutoff: stays defensible whatever the
# calibration curve looks like on a small val set.
REVIEW_PERCENTILE = 0.15

# --- band sets -------------------------------------------------------------
# ADULT_ONLY is the default. Switch to LIFESPAN only if Gate 0 proves the dataset
# actually carries paediatric and geriatric samples in usable numbers. Claiming
# paediatric banding on a 20-50 dataset is the fastest way to lose the panel.

BAND_SETS = {
    "adult_only": [
        {"id": "young_adult", "label": "Young adult (18-29)", "min": 18, "max": 29},
        {"id": "adult", "label": "Adult (30-49)", "min": 30, "max": 49},
        {"id": "older_adult", "label": "Older adult (50+)", "min": 50, "max": 120},
    ],
    "lifespan": [
        {"id": "paediatric", "label": "Paediatric (0-17)", "min": 0, "max": 17},
        {"id": "young_adult", "label": "Young adult (18-29)", "min": 18, "max": 29},
        {"id": "adult", "label": "Adult (30-49)", "min": 30, "max": 49},
        {"id": "older_adult", "label": "Older adult (50-64)", "min": 50, "max": 64},
        {"id": "geriatric", "label": "Geriatric (65+)", "min": 65, "max": 120},
    ],
}

ACTIVE_BAND_SET = "adult_only"  # ← Gate 0 flips this, nothing else

POLICIES = {
    "trial_eligibility_v1": {
        "id": "trial_eligibility_v1",
        "label": "Clinical trial age eligibility",
        "min_age": 18,
        "max_age": 64,
    },
    "telehealth_identity_v1": {
        "id": "telehealth_identity_v1",
        "label": "Telehealth identity age confirmation",
        "min_age": 18,
        "max_age": 120,
    },
}


def bands() -> list[dict]:
    return BAND_SETS[ACTIVE_BAND_SET]


def band_for(age: float) -> dict:
    """Band containing age. Clamps to the outermost band rather than returning None —
    a prediction always lands somewhere, and an unbanded result has no decision path."""
    bs = bands()
    for b in bs:
        if b["min"] <= age <= b["max"]:
            return b
    return bs[0] if age < bs[0]["min"] else bs[-1]


def boundaries() -> list[int]:
    """Interior band edges — the ages where a small error flips the clinical decision."""
    bs = bands()
    return [b["min"] for b in bs[1:]]


def straddles_boundary(interval: tuple[float, float]) -> bool:
    lo, hi = interval
    return any(lo < edge < hi for edge in boundaries())


def decide(
    age: float,
    interval: tuple[float, float],
    confidence_percentile: float,
    policy_id: str = "trial_eligibility_v1",
) -> dict:
    """Clinical decision + review routing.

    Review wins over verified/rejected: an uncertain prediction must never be
    auto-actioned, which is the whole point of the human-in-the-loop path.
    """
    policy = POLICIES[policy_id]

    if confidence_percentile <= REVIEW_PERCENTILE:
        return {
            "outcome": "review",
            "reason": f"Low model confidence (bottom {int(REVIEW_PERCENTILE * 100)}% of validation distribution).",
            "policy": policy_id,
            "rule": "confidence_percentile<=%.2f" % REVIEW_PERCENTILE,
        }

    if straddles_boundary(interval):
        return {
            "outcome": "review",
            "reason": "Prediction interval spans a clinical band boundary; band assignment is not decisive.",
            "policy": policy_id,
            "rule": "interval_straddles_band_boundary",
        }

    if policy["min_age"] <= age <= policy["max_age"]:
        return {
            "outcome": "verified",
            "reason": f"Estimated age within policy range {policy['min_age']}-{policy['max_age']}.",
            "policy": policy_id,
            "rule": "within_policy_range",
        }

    return {
        "outcome": "rejected",
        "reason": f"Estimated age outside policy range {policy['min_age']}-{policy['max_age']}.",
        "policy": policy_id,
        "rule": "outside_policy_range",
    }


def indeterminate(policy_id: str = "trial_eligibility_v1") -> dict:
    return {
        "outcome": "indeterminate",
        "reason": "No usable prediction for this image.",
        "policy": policy_id,
        "rule": "no_prediction",
    }


def _selfcheck() -> None:
    """Run: python server/bands.py"""
    assert band_for(25)["id"] == "young_adult"
    assert band_for(35)["id"] == "adult"
    assert band_for(70)["id"] == "older_adult"
    assert band_for(3)["id"] == "young_adult", "clamps below range, never None"

    assert boundaries() == [30, 50]
    assert straddles_boundary((28.0, 32.0)) is True
    assert straddles_boundary((31.0, 34.0)) is False

    # low confidence beats an otherwise-verifiable age
    d = decide(35.0, (33.0, 37.0), confidence_percentile=0.05)
    assert d["outcome"] == "review" and d["rule"].startswith("confidence_percentile")

    # boundary straddle beats verified
    d = decide(29.5, (27.0, 32.0), confidence_percentile=0.9)
    assert d["outcome"] == "review" and d["rule"] == "interval_straddles_band_boundary"

    # clean verify
    d = decide(35.0, (33.0, 37.0), confidence_percentile=0.9)
    assert d["outcome"] == "verified"

    # confidently outside policy
    d = decide(72.0, (70.0, 74.0), confidence_percentile=0.9)
    assert d["outcome"] == "rejected"

    # exactly at the threshold routes to review (<=, not <)
    d = decide(35.0, (34.0, 36.0), confidence_percentile=REVIEW_PERCENTILE)
    assert d["outcome"] == "review"

    print("bands.py selfcheck OK")


if __name__ == "__main__":
    _selfcheck()
