/**
 * Typed client for contract/predict.contract.md v1.0.0.
 *
 * These types ARE the contract. If the server drifts, this file must change in the
 * same commit — that is the whole reason the contract was frozen on day 1.
 */

export type Status = "ok" | "no_face" | "multi_face" | "low_quality" | "error";
export type Outcome = "verified" | "review" | "rejected" | "indeterminate";

export interface Band {
  id: string;
  label: string;
  min: number;
  max: number;
}

export interface Decision {
  outcome: Outcome;
  reason: string;
  policy: string;
  rule: string;
}

export interface Prediction {
  request_id: string;
  status: Status;
  age_estimate: number | null;
  age_interval: [number, number] | null;
  confidence: number | null;
  confidence_percentile: number | null;
  band: Band | null;
  decision: Decision;
  review_required: boolean;
  face_box: [number, number, number, number] | null;
  model: { name: string; version: string; head: string };
  latency_ms: number;
  contract: string;
  error?: string;
  quality_reason?: string;
}

export interface Meta {
  model: { name: string; version: string; head: string };
  bands: Band[];
  policy: { id: string; label: string; min_age: number; max_age: number };
  review_percentile: number;
  metrics: {
    mae: number | null;
    cs5: number | null;
    band_accuracy: number | null;
    baseline_mae: number | null;
  };
  calibration: { decile: number; mae: number; n: number }[];
  mock: boolean;
}

export interface QueueItem {
  request_id: string;
  age_estimate: number | null;
  confidence: number | null;
  confidence_percentile: number | null;
  band: Band | null;
  reason: string;
  created_at: string;
  resolved: boolean;
  reviewer: string | null;
  verdict: string | null;
  override_age: number | null;
}

export interface AuditRow {
  id: number;
  request_id: string;
  event: string;
  actor: string;
  detail: string;
  image_sha256: string | null;
  created_at: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* non-JSON error body; keep statusText */
    }
    throw new Error(`${res.status} · ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => fetch("/api/meta").then(json<Meta>),

  predict: (file: File, policy = "trial_eligibility_v1") => {
    const body = new FormData();
    body.append("file", file);
    body.append("policy", policy);
    return fetch("/api/predict", { method: "POST", body }).then(json<Prediction>);
  },

  queue: (includeResolved = false) =>
    fetch(`/api/review-queue?include_resolved=${includeResolved}`).then(
      json<{ items: QueueItem[]; count: number }>,
    ),

  resolve: (id: string, reviewer: string, verdict: "accept" | "override", overrideAge?: number) =>
    fetch(`/api/review-queue/${id}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviewer, verdict, override_age: overrideAge ?? null }),
    }).then(json<QueueItem>),

  audit: (limit = 100) =>
    fetch(`/api/audit?limit=${limit}`).then(json<{ items: AuditRow[]; count: number }>),
};

/** Outcome → token name. Single mapping, used by every view so states never diverge. */
export const outcomeTone: Record<Outcome, "ok" | "signal" | "stop" | "dim"> = {
  verified: "ok",
  review: "signal",
  rejected: "stop",
  indeterminate: "dim",
};

export const statusLabel: Record<Status, string> = {
  ok: "Prediction complete",
  no_face: "No face detected",
  multi_face: "Multiple faces detected",
  low_quality: "Image quality insufficient",
  error: "Service error",
};
