export interface AgeBand {
  id: string;
  label: string;
  min: number;
  max: number;
}

export type DecisionOutcome = "verified" | "rejected" | "review" | "indeterminate";

export interface Decision {
  outcome: DecisionOutcome;
  reason: string;
  policy: string;
  rule: string;
}

export interface Policy {
  id: string;
  label: string;
  min_age: number;
  max_age: number;
}

export interface ModelMeta {
  name: string;
  version: string;
  head: string;
  error?: string;
}

export interface PerBandMae {
  band: string;
  n: number;
  mae: number | null;
}

export interface Metrics {
  mae: number | null;
  cs5: number | null;
  band_accuracy: number | null;
  baseline_mae: number | null;
  n_test?: number;
  per_band_mae?: PerBandMae[];
}

export interface CalibrationPoint {
  nominal: number;
  empirical: number;
  gap: number;
  mean_width_years: number;
  n: number;
}

export interface RiskCoveragePoint {
  coverage: number;
  selective_mae: number;
}

export interface RiskCoverage {
  full_coverage_mae: number;
  mae_at_85pct_coverage: number;
  curve: RiskCoveragePoint[];
}

export interface Evidence {
  calibration_curve?: CalibrationPoint[];
  risk_coverage?: RiskCoverage;
}

export interface Meta {
  model: ModelMeta;
  bands: AgeBand[];
  policy: Policy;
  review_percentile: number;
  metrics: Metrics;
  calibration: CalibrationPoint[];
  evidence: Evidence;
  mock: boolean;
  public: boolean;
}

export type PredictionStatus = "ok" | "no_face" | "multi_face" | "low_quality" | "error";

export interface Prediction {
  request_id: string;
  status: PredictionStatus;
  age_estimate: number | null;
  age_interval: [number, number] | null;
  confidence: number | null;
  confidence_percentile: number | null;
  band: AgeBand | null;
  decision: Decision;
  review_required: boolean;
  face_box?: [number, number, number, number] | null;
  model: ModelMeta;
  latency_ms: number;
  contract: string;
  error?: string;
  quality_reason?: string;
  // Extra client metadata
  image_sha256?: string;
  timestamp?: string;
  probabilities?: number[]; // 1..100 distribution bins
}

export interface QueueItem {
  request_id: string;
  age_estimate: number | null;
  confidence: number | null;
  confidence_percentile: number | null;
  band: AgeBand | null;
  reason: string;
  created_at: string;
  resolved: boolean;
  reviewer?: string | null;
  verdict?: "accept" | "override" | "reject" | null;
  override_age?: number | null;
  resolved_at?: string | null;
  image_sha256?: string;
  notes?: string;
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

export interface FairnessGroup {
  group: string;
  n: number;
  mae: number;
  ci_low: number;
  ci_high: number;
}

export interface FairnessCell {
  race: string;
  band: string;
  n: number;
  mae: number | null;
  ci_low: number | null;
  ci_high: number | null;
}

export interface FairnessData {
  source: string;
  caveat: string;
  n: number;
  overall_mae: number;
  overall_ci: [number, number];
  by_race: FairnessGroup[];
  by_gender: FairnessGroup[];
  intersectional: FairnessCell[];
}
