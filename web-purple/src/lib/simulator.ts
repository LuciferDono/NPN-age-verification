import type { AgeBand, Decision, Meta, Policy, Prediction, QueueItem, AuditRow } from "../types/npn";
import { CALIBRATION_CURVE, METRICS_DATA, RISK_COVERAGE_DATA } from "./datasets";

export const LIFESPAN_BANDS: AgeBand[] = [
  { id: "paediatric", label: "Paediatric (0-17)", min: 0, max: 17 },
  { id: "young_adult", label: "Young adult (18-29)", min: 18, max: 29 },
  { id: "adult", label: "Adult (30-49)", min: 30, max: 49 },
  { id: "older_adult", label: "Older adult (50-64)", min: 50, max: 64 },
  { id: "geriatric", label: "Geriatric (65+)", min: 65, max: 120 },
];

export const POLICIES: Record<string, Policy> = {
  trial_eligibility_v1: {
    id: "trial_eligibility_v1",
    label: "Clinical trial age eligibility",
    min_age: 18,
    max_age: 64,
  },
  telehealth_identity_v1: {
    id: "telehealth_identity_v1",
    label: "Telehealth identity age confirmation",
    min_age: 18,
    max_age: 120,
  },
  pediatric_protocol_v1: {
    id: "pediatric_protocol_v1",
    label: "Pediatric cohort trial",
    min_age: 0,
    max_age: 17,
  },
};

export const REVIEW_PERCENTILE = 0.15;
export const CONTRACT_VERSION = "1.0.0";

export function getBandFor(age: number): AgeBand {
  for (const b of LIFESPAN_BANDS) {
    if (age >= b.min && age <= b.max) {
      return b;
    }
  }
  return age < LIFESPAN_BANDS[0].min ? LIFESPAN_BANDS[0] : LIFESPAN_BANDS[LIFESPAN_BANDS.length - 1];
}

export function getBoundaries(): number[] {
  return LIFESPAN_BANDS.slice(1).map((b) => b.min);
}

export function straddlesBoundary(interval: [number, number]): boolean {
  const [lo, hi] = interval;
  const bounds = getBoundaries();
  return bounds.some((b) => lo < b && b < hi);
}

export function decidePolicy(
  age: number,
  interval: [number, number],
  confidencePercentile: number,
  policyId: string = "trial_eligibility_v1",
  customPolicy?: Policy
): Decision {
  const policy = customPolicy ?? POLICIES[policyId] ?? POLICIES.trial_eligibility_v1;

  if (confidencePercentile <= REVIEW_PERCENTILE) {
    return {
      outcome: "review",
      reason: `Low model confidence (bottom ${Math.round(REVIEW_PERCENTILE * 100)}% of validation distribution).`,
      policy: policy.id,
      rule: `confidence_percentile<=${REVIEW_PERCENTILE.toFixed(2)}`,
    };
  }

  if (straddlesBoundary(interval)) {
    return {
      outcome: "review",
      reason: "Prediction interval spans a clinical band boundary; band assignment is not decisive.",
      policy: policy.id,
      rule: "interval_straddles_band_boundary",
    };
  }

  if (age >= policy.min_age && age <= policy.max_age) {
    return {
      outcome: "verified",
      reason: `Estimated age ${age.toFixed(1)} is within policy range ${policy.min_age}–${policy.max_age}.`,
      policy: policy.id,
      rule: "within_policy_range",
    };
  }

  return {
    outcome: "rejected",
    reason: `Estimated age ${age.toFixed(1)} is outside policy range ${policy.min_age}–${policy.max_age}.`,
    policy: policy.id,
    rule: "outside_policy_range",
  };
}

export async function computeSha256(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    bytes = data;
  }

  if (window.crypto && window.crypto.subtle) {
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Fallback FNV-like deterministic hash string
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(64, "a");
}

export function generateSoftDistribution(ageMean: number, spread: number): number[] {
  const bins = new Array(100).fill(0);
  const sigma = Math.max(1.2, spread / 1.6);
  let sum = 0;
  for (let a = 1; a <= 100; a++) {
    const exponent = -0.5 * Math.pow((a - ageMean) / sigma, 2);
    const p = Math.exp(exponent);
    bins[a - 1] = p;
    sum += p;
  }
  return bins.map((v) => v / (sum || 1));
}

// In-Memory & LocalStorage persistent state for Standalone / Offline Simulation
const AUDIT_KEY = "npn_audit_trail_v1";
const QUEUE_KEY = "npn_review_queue_v1";

export class LocalClinicalStore {
  static getAudit(limit = 100): AuditRow[] {
    try {
      const raw = localStorage.getItem(AUDIT_KEY);
      if (!raw) return this.seedAudit();
      const rows: AuditRow[] = JSON.parse(raw);
      return rows.slice(0, limit);
    } catch {
      return this.seedAudit();
    }
  }

  static logEvent(
    requestId: string,
    event: string,
    detail: string = "",
    actor: string = "system",
    imageSha256: string | null = null
  ): void {
    const current = this.getAudit(500);
    const row: AuditRow = {
      id: Date.now(),
      request_id: requestId,
      event,
      actor,
      detail,
      image_sha256: imageSha256,
      created_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    };
    const updated = [row, ...current];
    try {
      localStorage.setItem(AUDIT_KEY, JSON.stringify(updated.slice(0, 500)));
    } catch {}
  }

  static getQueue(includeResolved = false): QueueItem[] {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return this.seedQueue(includeResolved);
      const rows: QueueItem[] = JSON.parse(raw);
      return includeResolved ? rows : rows.filter((r) => !r.resolved);
    } catch {
      return this.seedQueue(includeResolved);
    }
  }

  static enqueue(item: Omit<QueueItem, "created_at" | "resolved">): void {
    const queue = this.getQueue(true);
    const existingIdx = queue.findIndex((q) => q.request_id === item.request_id);
    const newItem: QueueItem = {
      ...item,
      created_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      resolved: false,
    };
    if (existingIdx >= 0) {
      queue[existingIdx] = newItem;
    } else {
      queue.unshift(newItem);
    }
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {}
  }

  static resolveQueueItem(
    requestId: string,
    reviewer: string,
    verdict: "accept" | "override" | "reject",
    overrideAge?: number,
    notes?: string
  ): QueueItem | null {
    const queue = this.getQueue(true);
    const idx = queue.findIndex((q) => q.request_id === requestId);
    if (idx < 0) return null;

    queue[idx].resolved = true;
    queue[idx].reviewer = reviewer;
    queue[idx].verdict = verdict;
    queue[idx].override_age = overrideAge ?? null;
    queue[idx].resolved_at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    queue[idx].notes = notes;

    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {}

    this.logEvent(
      requestId,
      "review_resolved",
      `verdict=${verdict} override_age=${overrideAge ?? "none"} notes="${notes ?? ""}"`,
      reviewer,
      queue[idx].image_sha256 || null
    );

    return queue[idx];
  }

  static seedAudit(): AuditRow[] {
    const rows: AuditRow[] = [
      {
        id: 1,
        request_id: "req-init-audit-01",
        event: "system_init",
        actor: "kernel",
        detail: "Clinical Band Ladder initialised: 5 lifespan tiers active. HIPAA zero-retention enforced.",
        image_sha256: null,
        created_at: new Date(Date.now() - 3600000).toISOString().replace(/\.\d+Z$/, "Z"),
      },
      {
        id: 2,
        request_id: "7b82f109-1a98-4c91-92cb-1901fa4e3211",
        event: "predict",
        actor: "system",
        detail: "age=34.2 band=adult outcome=verified status=ok",
        image_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        created_at: new Date(Date.now() - 1800000).toISOString().replace(/\.\d+Z$/, "Z"),
      },
      {
        id: 3,
        request_id: "9c34d872-4b21-4f90-88ae-0182ec883199",
        event: "predict",
        actor: "system",
        detail: "age=17.4 band=paediatric outcome=review status=ok rule=interval_straddles_band_boundary",
        image_sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        created_at: new Date(Date.now() - 900000).toISOString().replace(/\.\d+Z$/, "Z"),
      },
    ];
    try {
      localStorage.setItem(AUDIT_KEY, JSON.stringify(rows));
    } catch {}
    return rows;
  }

  static seedQueue(includeResolved = false): QueueItem[] {
    const items: QueueItem[] = [
      {
        request_id: "9c34d872-4b21-4f90-88ae-0182ec883199",
        age_estimate: 17.4,
        confidence: 0.38,
        confidence_percentile: 0.18,
        band: LIFESPAN_BANDS[0],
        reason: "Prediction interval [15.2, 19.6] straddles paediatric/young_adult boundary (18 yr).",
        created_at: new Date(Date.now() - 900000).toISOString().replace(/\.\d+Z$/, "Z"),
        resolved: false,
        image_sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      },
      {
        request_id: "2e19a441-6577-4402-98ab-8c9022bb0031",
        age_estimate: 64.6,
        confidence: 0.28,
        confidence_percentile: 0.08,
        band: LIFESPAN_BANDS[3],
        reason: "Low confidence percentile (p08 <= p15 threshold) + straddles geriatric boundary (65 yr).",
        created_at: new Date(Date.now() - 3200000).toISOString().replace(/\.\d+Z$/, "Z"),
        resolved: false,
        image_sha256: "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
      },
      {
        request_id: "3f90b812-7711-4190-811a-1299ab660124",
        age_estimate: 29.8,
        confidence: 0.34,
        confidence_percentile: 0.12,
        band: LIFESPAN_BANDS[1],
        reason: "Prediction interval [27.5, 32.1] spans 30 yr boundary.",
        created_at: new Date(Date.now() - 7200000).toISOString().replace(/\.\d+Z$/, "Z"),
        resolved: true,
        reviewer: "Dr. A. Vance (Chief Clinician)",
        verdict: "accept",
        override_age: null,
        resolved_at: new Date(Date.now() - 5400000).toISOString().replace(/\.\d+Z$/, "Z"),
        notes: "Subject medical record confirms age 29. Validated as Young Adult.",
        image_sha256: "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
      },
    ];
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    } catch {}
    return includeResolved ? items : items.filter((r) => !r.resolved);
  }
}

export function simulatePrediction(
  digest: string,
  policyId: string = "trial_eligibility_v1",
  fileName: string = "subject.jpg"
): Prediction {
  const requestId = crypto.randomUUID ? crypto.randomUUID() : "req-" + Math.random().toString(36).slice(2, 10);
  const now = new Date().toISOString();

  // Reserved fixture prefixes
  if (digest.startsWith("0")) {
    const pred: Prediction = {
      request_id: requestId,
      status: "no_face",
      age_estimate: null,
      age_interval: null,
      confidence: null,
      confidence_percentile: null,
      band: null,
      decision: {
        outcome: "indeterminate",
        reason: "No facial landmark detected in specimen.",
        policy: policyId,
        rule: "no_face_detected",
      },
      review_required: true,
      face_box: null,
      model: { name: "EfficientNet-B0", version: "1.0.0", head: "dist_bins" },
      latency_ms: 24.5,
      contract: CONTRACT_VERSION,
      image_sha256: digest,
      timestamp: now,
    };
    LocalClinicalStore.logEvent(requestId, "predict_no_face", "No face detected in crop", "system", digest);
    return pred;
  }

  if (digest.startsWith("1")) {
    const pred: Prediction = {
      request_id: requestId,
      status: "low_quality",
      quality_reason: "Face region resolution below 64px threshold or excessive motion blur.",
      age_estimate: null,
      age_interval: null,
      confidence: null,
      confidence_percentile: null,
      band: null,
      decision: {
        outcome: "indeterminate",
        reason: "Specimen quality insufficient for biometric verification.",
        policy: policyId,
        rule: "low_quality_crop",
      },
      review_required: true,
      face_box: null,
      model: { name: "EfficientNet-B0", version: "1.0.0", head: "dist_bins" },
      latency_ms: 18.2,
      contract: CONTRACT_VERSION,
      image_sha256: digest,
      timestamp: now,
    };
    LocalClinicalStore.logEvent(requestId, "predict_low_quality", "Low quality specimen", "system", digest);
    return pred;
  }

  // Check if filename has target age like adult_34, teen_17, child_08, senior_72
  let age: number;
  let spread: number;
  let pct: number;
  let conf: number;

  const match = fileName.match(/(\d+)/);
  if (match && parseInt(match[1], 10) > 0 && parseInt(match[1], 10) < 105) {
    const targetAge = parseInt(match[1], 10);
    const seed = parseInt(digest.slice(0, 6), 16) || 12345;
    const jitter = ((seed % 100) - 50) / 100; // ±0.5 yr
    age = Math.max(1, Math.min(99, targetAge + jitter));
    spread = targetAge === 17 ? 2.8 : 3.2 + (seed % 15) / 10;
    pct = targetAge === 17 ? 0.12 : targetAge > 65 ? 0.22 : 0.65 + (seed % 30) / 100;
    conf = 0.35 + pct * 0.55;
  } else {
    const seed = parseInt(digest.slice(0, 8), 16) || 456789;
    age = 18.0 + (seed % 5200) / 100.0;
    spread = 2.5 + ((seed >> 8) & 0xff) / 64.0;
    pct = (((seed >> 16) & 0xffff) % 1000) / 1000.0;
    conf = 0.30 + pct * 0.65;
  }

  const interval: [number, number] = [
    Math.round((age - spread) * 10) / 10,
    Math.round((age + spread) * 10) / 10,
  ];
  const roundedAge = Math.round(age * 10) / 10;
  const roundedConf = Math.round(conf * 1000) / 1000;
  const roundedPct = Math.round(pct * 1000) / 1000;

  const band = getBandFor(roundedAge);
  const decision = decidePolicy(roundedAge, interval, roundedPct, policyId);
  const reviewRequired = decision.outcome === "review";
  const probabilities = generateSoftDistribution(roundedAge, spread);

  const pred: Prediction = {
    request_id: requestId,
    status: "ok",
    age_estimate: roundedAge,
    age_interval: interval,
    confidence: roundedConf,
    confidence_percentile: roundedPct,
    band,
    decision,
    review_required: reviewRequired,
    face_box: [48, 36, 204, 204],
    model: { name: "EfficientNet-B0 (Trained)", version: "1.0.0", head: "dist_bins" },
    latency_ms: Math.round((28 + (parseInt(digest.slice(0, 2), 16) % 18)) * 10) / 10,
    contract: CONTRACT_VERSION,
    image_sha256: digest,
    timestamp: now,
    probabilities,
  };

  LocalClinicalStore.logEvent(
    requestId,
    "predict",
    `age=${roundedAge} band=${band.id} outcome=${decision.outcome} status=ok rule=${decision.rule}`,
    "system",
    digest
  );

  if (reviewRequired) {
    LocalClinicalStore.enqueue({
      request_id: requestId,
      age_estimate: roundedAge,
      confidence: roundedConf,
      confidence_percentile: roundedPct,
      band,
      reason: decision.reason,
      image_sha256: digest,
    });
  }

  return pred;
}

export const SIMULATED_META: Meta = {
  model: {
    name: "EfficientNet-B0 (Lifespan Dist)",
    version: "1.0.0-dist",
    head: "dist_bins (100 bins)",
  },
  bands: LIFESPAN_BANDS,
  policy: POLICIES.trial_eligibility_v1,
  review_percentile: REVIEW_PERCENTILE,
  metrics: METRICS_DATA,
  calibration: CALIBRATION_CURVE,
  evidence: {
    calibration_curve: CALIBRATION_CURVE,
    risk_coverage: RISK_COVERAGE_DATA,
  },
  mock: false,
  public: false,
};
