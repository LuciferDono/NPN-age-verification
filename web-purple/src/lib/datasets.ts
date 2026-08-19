import type { FairnessData, Metrics, CalibrationPoint, RiskCoverage } from "../types/npn";

export const METRICS_DATA: Metrics = {
  mae: 5.6395,
  cs5: 0.5930,
  band_accuracy: 0.6685,
  baseline_mae: 11.3356,
  n_test: 47568,
  per_band_mae: [
    { band: "paediatric", n: 2937, mae: 6.2009 },
    { band: "young_adult", n: 13121, mae: 4.9802 },
    { band: "adult", n: 23301, mae: 4.7962 },
    { band: "older_adult", n: 5933, mae: 7.5955 },
    { band: "geriatric", n: 2276, mae: 12.2502 },
    { band: "geriatric_90plus", n: 77, mae: 15.9467 },
  ],
};

export const CALIBRATION_CURVE: CalibrationPoint[] = [
  { nominal: 0.50, empirical: 0.5244, gap: 0.0244, mean_width_years: 9.05, n: 47568 },
  { nominal: 0.60, empirical: 0.6133, gap: 0.0133, mean_width_years: 11.11, n: 47568 },
  { nominal: 0.70, empirical: 0.7030, gap: 0.0030, mean_width_years: 13.56, n: 47568 },
  { nominal: 0.80, empirical: 0.7908, gap: -0.0092, mean_width_years: 16.75, n: 47568 },
  { nominal: 0.90, empirical: 0.8819, gap: -0.0181, mean_width_years: 21.80, n: 47568 },
  { nominal: 0.95, empirical: 0.9306, gap: -0.0194, mean_width_years: 26.63, n: 47568 },
];

export const RISK_COVERAGE_DATA: RiskCoverage = {
  full_coverage_mae: 5.6395,
  mae_at_85pct_coverage: 4.6120,
  curve: [
    { coverage: 0.10, selective_mae: 2.75 },
    { coverage: 0.20, selective_mae: 3.20 },
    { coverage: 0.30, selective_mae: 3.55 },
    { coverage: 0.40, selective_mae: 3.88 },
    { coverage: 0.50, selective_mae: 4.12 },
    { coverage: 0.60, selective_mae: 4.31 },
    { coverage: 0.70, selective_mae: 4.45 },
    { coverage: 0.80, selective_mae: 4.54 },
    { coverage: 0.85, selective_mae: 4.61 },
    { coverage: 0.90, selective_mae: 4.88 },
    { coverage: 0.95, selective_mae: 5.21 },
    { coverage: 1.00, selective_mae: 5.64 },
  ],
};

export const CONFIDENCE_DECILES = [
  { decile: 1, n: 4756, conf_min: 0.0064, conf_max: 0.2066, mae: 10.117 },
  { decile: 2, n: 4756, conf_min: 0.2066, conf_max: 0.2472, mae: 7.854 },
  { decile: 3, n: 4756, conf_min: 0.2472, conf_max: 0.2789, mae: 6.920 },
  { decile: 4, n: 4756, conf_min: 0.2789, conf_max: 0.3088, mae: 6.210 },
  { decile: 5, n: 4756, conf_min: 0.3088, conf_max: 0.3400, mae: 5.640 },
  { decile: 6, n: 4756, conf_min: 0.3400, conf_max: 0.3752, mae: 5.120 },
  { decile: 7, n: 4756, conf_min: 0.3752, conf_max: 0.4180, mae: 4.630 },
  { decile: 8, n: 4756, conf_min: 0.4180, conf_max: 0.4735, mae: 4.190 },
  { decile: 9, n: 4756, conf_min: 0.4735, conf_max: 0.5580, mae: 3.720 },
  { decile: 10, n: 4756, conf_min: 0.5580, conf_max: 0.9840, mae: 3.120 },
];

export const TRAINING_LOGS = [
  { epoch: 1, train_loss: 4.12, val_loss: 3.85, val_mae: 8.42, lr: 0.001 },
  { epoch: 2, train_loss: 3.65, val_loss: 3.42, val_mae: 7.18, lr: 0.001 },
  { epoch: 3, train_loss: 3.32, val_loss: 3.15, val_mae: 6.54, lr: 0.001 },
  { epoch: 4, train_loss: 3.08, val_loss: 2.98, val_mae: 6.12, lr: 0.0005 },
  { epoch: 5, train_loss: 2.89, val_loss: 2.86, val_mae: 5.89, lr: 0.0005 },
  { epoch: 6, train_loss: 2.74, val_loss: 2.79, val_mae: 5.76, lr: 0.0002 },
  { epoch: 7, train_loss: 2.62, val_loss: 2.75, val_mae: 5.68, lr: 0.0002, is_best: true },
  { epoch: 8, train_loss: 2.54, val_loss: 2.77, val_mae: 5.71, lr: 0.0001 },
  { epoch: 9, train_loss: 2.48, val_loss: 2.80, val_mae: 5.74, lr: 0.0001 },
  { epoch: 10, train_loss: 2.42, val_loss: 2.82, val_mae: 5.79, lr: 0.00005 },
  { epoch: 11, train_loss: 2.38, val_loss: 2.85, val_mae: 5.82, lr: 0.00002 },
  { epoch: 12, train_loss: 2.35, val_loss: 2.87, val_mae: 5.85, lr: 0.00001 },
];

export const FAIRNESS_BENCHMARK: FairnessData = {
  source: "UTKFace (jangedoo/utkface-new), zero-shot inference, N=23,684",
  caveat: "Out of distribution for this model. Absolute MAE is not directly comparable to our held-out split; only the relative spread across demographic cohorts is evaluated.",
  n: 23684,
  overall_mae: 4.83,
  overall_ci: [4.766, 4.893],
  by_race: [
    { group: "White", n: 10066, mae: 4.883, ci_low: 4.788, ci_high: 4.985 },
    { group: "Black", n: 4523, mae: 5.931, ci_low: 5.762, ci_high: 6.109 },
    { group: "Indian", n: 3973, mae: 4.886, ci_low: 4.739, ci_high: 5.042 },
    { group: "Asian", n: 3430, mae: 3.797, ci_low: 3.653, ci_high: 3.957 },
    { group: "Other", n: 1692, mae: 3.530, ci_low: 3.339, ci_high: 3.724 },
  ],
  by_gender: [
    { group: "Male", n: 12386, mae: 5.154, ci_low: 5.061, ci_high: 5.251 },
    { group: "Female", n: 11298, mae: 4.474, ci_low: 4.384, ci_high: 4.568 },
  ],
  intersectional: [
    // Paediatric (0-17)
    { race: "Asian", band: "0-17", n: 412, mae: 1.42, ci_low: 1.25, ci_high: 1.62 },
    { race: "White", band: "0-17", n: 1420, mae: 2.15, ci_low: 2.01, ci_high: 2.31 },
    { race: "Indian", band: "0-17", n: 580, mae: 2.38, ci_low: 2.15, ci_high: 2.65 },
    { race: "Other", band: "0-17", n: 390, mae: 2.05, ci_low: 1.80, ci_high: 2.35 },
    { race: "Black", band: "0-17", n: 845, mae: 5.29, ci_low: 4.88, ci_high: 5.74 },

    // Young Adult (18-29)
    { race: "Asian", band: "18-29", n: 1280, mae: 3.27, ci_low: 3.10, ci_high: 3.46 },
    { race: "Other", band: "18-29", n: 620, mae: 3.45, ci_low: 3.18, ci_high: 3.75 },
    { race: "Black", band: "18-29", n: 1450, mae: 3.82, ci_low: 3.61, ci_high: 4.05 },
    { race: "Indian", band: "18-29", n: 1480, mae: 3.95, ci_low: 3.75, ci_high: 4.18 },
    { race: "White", band: "18-29", n: 3120, mae: 4.04, ci_low: 3.90, ci_high: 4.19 },

    // Adult (30-49)
    { race: "Other", band: "30-49", n: 490, mae: 4.75, ci_low: 4.35, ci_high: 5.18 },
    { race: "Asian", band: "30-49", n: 1120, mae: 5.12, ci_low: 4.82, ci_high: 5.45 },
    { race: "Indian", band: "30-49", n: 1320, mae: 5.68, ci_low: 5.38, ci_high: 6.01 },
    { race: "White", band: "30-49", n: 3410, mae: 5.92, ci_low: 5.72, ci_high: 6.14 },
    { race: "Black", band: "30-49", n: 1420, mae: 6.71, ci_low: 6.35, ci_high: 7.10 },

    // Older Adult (50-64)
    { race: "Other", band: "50-64", n: 140, mae: 5.53, ci_low: 4.70, ci_high: 6.45 },
    { race: "Asian", band: "50-64", n: 450, mae: 6.25, ci_low: 5.65, ci_high: 6.90 },
    { race: "Indian", band: "50-64", n: 430, mae: 6.88, ci_low: 6.20, ci_high: 7.60 },
    { race: "White", band: "50-64", n: 1450, mae: 7.15, ci_low: 6.78, ci_high: 7.55 },
    { race: "Black", band: "50-64", n: 580, mae: 8.60, ci_low: 7.90, ci_high: 9.35 },

    // Geriatric (65+)
    { race: "White", band: "65+", n: 666, mae: 8.45, ci_low: 7.80, ci_high: 9.15 },
    { race: "Asian", band: "65+", n: 168, mae: 9.12, ci_low: 7.85, ci_high: 10.50 },
    { race: "Indian", band: "65+", n: 163, mae: 9.85, ci_low: 8.40, ci_high: 11.40 },
    { race: "Other", band: "65+", n: 52, mae: 10.20, ci_low: 7.90, ci_high: 12.80 },
    { race: "Black", band: "65+", n: 228, mae: 12.01, ci_low: 10.65, ci_high: 13.50 },
  ],
};

export const PRESET_SAMPLES = [
  {
    id: "adult_34",
    title: "Subject 01 (Adult 34)",
    age: 34,
    gender: "Female",
    path: "/samples/adult_34.jpg",
    description: "Nominal adult profile, clearly within 18-64 eligibility envelope.",
    expectedOutcome: "verified",
  },
  {
    id: "child_08",
    title: "Subject 02 (Child 08)",
    age: 8,
    gender: "Female",
    path: "/samples/child_08.jpg",
    description: "Pediatric subject under 18 policy threshold.",
    expectedOutcome: "rejected",
  },
  {
    id: "teen_17",
    title: "Subject 03 (Teen 17)",
    age: 17,
    gender: "Male",
    path: "/samples/teen_17.jpg",
    description: "Critical boundary straddler (17 yr, interval [15.2, 19.3]). Auto-routes to review.",
    expectedOutcome: "review",
  },
  {
    id: "senior_72",
    title: "Subject 04 (Senior 72)",
    age: 72,
    gender: "Male",
    path: "/samples/senior_72.jpg",
    description: "Geriatric case outside 18-64 trial scope.",
    expectedOutcome: "rejected",
  },
];
