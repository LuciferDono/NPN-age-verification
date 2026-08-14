# API Contract — FROZEN

Frozen at Day 1 Hour 1. **Do not change shape.** Frontend builds against this;
model swaps in behind it. Any change requires both lane owners to agree, in writing, here.

Version: `1.0.0`

---

## POST `/api/predict`

`multipart/form-data`, field `file` — a single image (jpg/png, max 10 MB).
Optional field `policy` — string, defaults to `trial_eligibility_v1`.

### Response 200 — every status returns this same envelope

```json
{
  "request_id": "3f9a1c2e-7b41-4d8a-9e12-5c8b0a6d4f77",
  "status": "ok",
  "age_estimate": 34.2,
  "age_interval": [29.1, 39.3],
  "confidence": 0.781,
  "confidence_percentile": 0.42,
  "band": { "id": "adult", "label": "Adult (18-64)", "min": 18, "max": 64 },
  "decision": {
    "outcome": "verified",
    "reason": "Estimated age within policy range with sufficient confidence.",
    "policy": "trial_eligibility_v1"
  },
  "review_required": false,
  "face_box": [64, 48, 192, 192],
  "model": { "name": "efficientnet_b0", "version": "0.1.0", "head": "dist_bins" },
  "latency_ms": 41
}
```

### `status` enum — exhaustive, frontend must render all five

| status | meaning | `age_estimate` | UI state |
|---|---|---|---|
| `ok` | face found, prediction made | number | result view |
| `no_face` | no face detected | `null` | "No face detected" empty state + retry affordance |
| `multi_face` | more than one face | `null` | "Multiple faces — submit a single subject" |
| `low_quality` | face found, below quality gate (too small / blurred) | `null` | "Image quality insufficient" + the measured reason |
| `error` | server-side failure | `null` | error state, `request_id` shown for the audit trail |

When `status != "ok"`: `age_estimate`, `age_interval`, `confidence`,
`confidence_percentile`, `band` are `null`; `decision.outcome` is `"indeterminate"`;
`review_required` is `true`; `face_box` may be `null`.

### `decision.outcome` enum

| outcome | meaning |
|---|---|
| `verified` | within policy age range, confidence above review threshold |
| `review` | routed to manual review (low confidence **or** near a band boundary) |
| `rejected` | confidently outside policy age range |
| `indeterminate` | no usable prediction (`status != "ok"`) |

### Review routing rule — percentile, not raw confidence

A prediction routes to `review` when **either**:

1. `confidence_percentile <= 0.15` — bottom 15% of validation-set confidence, **or**
2. the 80% interval `age_interval` straddles a policy band boundary.

Percentile is used rather than a raw confidence cutoff so the rule stays defensible
regardless of how the calibration curve comes out. The threshold constant lives in
`server/bands.py:REVIEW_PERCENTILE`.

---

## GET `/api/review-queue`

```json
{
  "items": [
    {
      "request_id": "…",
      "age_estimate": 17.4,
      "confidence": 0.31,
      "confidence_percentile": 0.08,
      "band": { "id": "minor", "label": "Minor (<18)", "min": 0, "max": 17 },
      "reason": "confidence_percentile<=0.15",
      "created_at": "2026-08-14T09:12:44Z",
      "resolved": false
    }
  ],
  "count": 1
}
```

## POST `/api/review-queue/{request_id}/resolve`

Body: `{ "reviewer": "string", "verdict": "accept" | "override", "override_age": 19 }`
Returns the updated item. Writes an audit row.

## GET `/api/audit?limit=50`

```json
{
  "items": [
    {
      "id": 1,
      "request_id": "…",
      "event": "predict",
      "actor": "system",
      "detail": "age=34.2 band=adult outcome=verified",
      "image_sha256": "9f2b…",
      "created_at": "2026-08-14T09:12:44Z"
    }
  ],
  "count": 1
}
```

`image_sha256` only — **the image itself is never persisted.** This is the answer to
the panel's HIPAA question, and it is enforced in `server/store.py`, not just claimed.

## GET `/api/meta`

```json
{
  "model": { "name": "efficientnet_b0", "version": "0.1.0", "head": "dist_bins" },
  "bands": [ { "id": "minor", "label": "Minor (<18)", "min": 0, "max": 17 } ],
  "policy": { "id": "trial_eligibility_v1", "min_age": 18, "max_age": 64 },
  "metrics": { "mae": 4.81, "cs5": 0.62, "band_accuracy": 0.88, "baseline_mae": 11.2 },
  "calibration": [ { "decile": 1, "mae": 9.1, "n": 240 } ],
  "mock": true
}
```

Frontend reads `/api/meta` for the metrics panel and band labels — **no numbers are
hardcoded in the UI.** `mock: true` must be surfaced as a visible badge so nobody
demos mock data by accident.

## GET `/api/health`

`{ "ok": true, "mock": true, "model_loaded": false }`
