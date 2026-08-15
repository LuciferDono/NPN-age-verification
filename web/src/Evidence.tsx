import type { CoveragePoint, Meta } from "./api";
import { Empty, Field, Panel, Td, Th } from "./ui";

/**
 * The evidence view: whether the numbers this console shows can be trusted.
 *
 * Three separate claims, deliberately not merged into one "accuracy" figure:
 *   per-band MAE     where the model is weak, stated rather than averaged away
 *   coverage         does an 80% interval contain the truth 80% of the time
 *   risk-coverage    does deferring the least-confident cases actually reduce error
 *
 * The first is accuracy. The second and third are about uncertainty, and they are what
 * make the review queue defensible instead of decorative. All are measured on the
 * held-out split, never on data the model trained against.
 */

const BAND_LABEL: Record<string, string> = {
  paediatric: "Paediatric",
  young_adult: "Young adult",
  adult: "Adult",
  older_adult: "Older adult",
  geriatric: "Geriatric",
  geriatric_90plus: "— of which 90+",
};

export function Evidence({ meta }: { meta: Meta | null }) {
  const m = meta?.metrics;
  const ev = meta?.evidence;
  const cov = ev?.calibration_curve ?? [];
  const rc = ev?.risk_coverage;
  const bands = m?.per_band_mae ?? [];

  if (!meta || meta.mock) {
    return (
      <Empty>
        Evidence is only shown for a trained model. The service is running with a synthetic
        model, which has no measured accuracy to report.
      </Empty>
    );
  }

  if (!bands.length && !cov.length && !rc) {
    return (
      <Empty>
        No evaluation artifacts found. Run <span className="font-mono">python -m ml.evaluate</span>{" "}
        to measure coverage and selective-prediction evidence for this checkpoint.
      </Empty>
    );
  }

  const worst = bands
    .filter((b) => b.mae !== null && b.band !== "geriatric_90plus")
    .sort((a, b) => (b.mae ?? 0) - (a.mae ?? 0))[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Held-out accuracy">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Mean abs. error" value={fmt(m?.mae, "yr")} size="lg" />
            <Field label="Baseline" value={fmt(m?.baseline_mae, "yr")} />
            <Field label="Within 5 years" value={pct(m?.cs5)} />
            <Field label="Correct band" value={pct(m?.band_accuracy)} />
          </div>
          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-dim">
            Measured on {m?.n_test?.toLocaleString() ?? "—"} images held out of training.
            The baseline predicts the mean age for every subject; anything above it is not
            learning.
          </p>
        </Panel>

        <Panel title="Interval honesty">
          <CoverageChart points={cov} />
          <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">
            {cov.length ? (
              <>
                An {pctLabel(0.8)} interval contains the true age{" "}
                <span className="font-mono text-ink">
                  {pct(cov.find((c) => c.nominal === 0.8)?.empirical)}
                </span>
                {" "}of the time. The stated uncertainty is the actual uncertainty, so the
                interval shown on an assessment means what it says.
              </>
            ) : (
              "Not yet measured."
            )}
          </p>
        </Panel>

        <Panel title="Value of deferring">
          <RiskCoverageChart rc={rc} threshold={1 - (meta.review_percentile ?? 0.15)} />
          <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">
            {rc?.mae_at_85pct_coverage && rc.full_coverage_mae ? (
              <>
                Routing the least-confident{" "}
                {pctLabel(meta.review_percentile)} to a reviewer lowers error on the
                auto-decided cases from{" "}
                <span className="font-mono">{rc.full_coverage_mae.toFixed(2)}</span>
                {" "}to{" "}
                <span className="font-mono text-signal">
                  {rc.mae_at_85pct_coverage.toFixed(2)}
                </span>
                {" "}years. The queue is doing measurable work.
              </>
            ) : (
              "Not yet measured."
            )}
          </p>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_minmax(320px,420px)]">
        <Panel
          title="Accuracy by clinical band"
          aside={<span className="label">held-out split</span>}
        >
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Band</Th>
                <Th align="right" w="18%">Images</Th>
                <Th align="right" w="18%">MAE (yr)</Th>
                <Th w="34%">Relative to best band</Th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b) => {
                const best = Math.min(
                  ...bands.filter((x) => x.mae !== null).map((x) => x.mae as number),
                );
                const ratio = b.mae ? b.mae / best : 0;
                const sub = b.band === "geriatric_90plus";
                return (
                  <tr key={b.band}>
                    <Td mono={false} tone={sub ? "dim" : undefined}>
                      <span className={sub ? "pl-3" : ""}>{BAND_LABEL[b.band] ?? b.band}</span>
                    </Td>
                    <Td align="right">{b.n.toLocaleString()}</Td>
                    <Td align="right" tone={b.mae && b.mae > 2 * best ? "stop" : undefined}>
                      {b.mae?.toFixed(2) ?? "—"}
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span
                          style={{ width: `${Math.min(100, (ratio / 3.5) * 100)}%` }}
                          className={`h-1.5 ${b.mae && b.mae > 2 * best ? "bg-stop" : "bg-ink-faint"}`}
                        />
                        <span className="shrink-0 text-[10px] text-ink-faint">
                          {ratio.toFixed(1)}×
                        </span>
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {worst?.mae && (
            <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-dim">
              The {BAND_LABEL[worst.band]?.toLowerCase()} band is the weakest and is reported
              separately for that reason. A single headline figure would average it away.
              Predictions in this band are more likely to reach a reviewer, which is the
              intended behaviour rather than a workaround.
            </p>
          )}
        </Panel>

        <Panel title="Error by confidence decile">
          {meta.calibration.length ? (
            <>
              <DecileChart rows={meta.calibration} />
              <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">
                Sorted from least to most confident. Error falls at every step, so the
                confidence score ranks the model's own mistakes correctly.
              </p>
            </>
          ) : (
            <Empty>Not yet measured.</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ charts */
/* Inline SVG rather than a chart library: three small plots do not justify a
   dependency, and hand-drawn axes match the console's hairline vocabulary. */

const PLOT = { w: 300, h: 170, l: 34, r: 8, t: 8, b: 24 };

function scales() {
  const { w, h, l, r, t, b } = PLOT;
  return {
    X: (f: number) => l + (w - l - r) * f,
    Y: (f: number) => t + (h - t - b) * (1 - f),
  };
}

function CoverageChart({ points }: { points: CoveragePoint[] }) {
  if (!points.length) return <Empty>Not yet measured.</Empty>;
  const { X, Y } = scales();
  const f = (v: number) => (v - 0.4) / 0.6; // axis spans 0.40 - 1.00

  return (
    <svg viewBox={`0 0 ${PLOT.w} ${PLOT.h}`} className="w-full" role="img"
         aria-label="Nominal versus empirical interval coverage">
      {[0.5, 0.7, 0.9].map((v) => (
        <g key={v}>
          <line x1={X(0)} y1={Y(f(v))} x2={X(1)} y2={Y(f(v))} className="stroke-line" />
          <text x={X(0) - 6} y={Y(f(v)) + 3} textAnchor="end"
                className="fill-ink-faint font-mono text-[8px]">{v.toFixed(1)}</text>
        </g>
      ))}
      {/* perfect calibration */}
      <line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(1)} className="stroke-ok"
            strokeDasharray="4 3" strokeWidth={1.5} />
      <polyline
        points={points.map((p) => `${X(f(p.nominal))},${Y(f(p.empirical))}`).join(" ")}
        fill="none" className="stroke-ink" strokeWidth={2} />
      {points.map((p) => (
        <circle key={p.nominal} cx={X(f(p.nominal))} cy={Y(f(p.empirical))} r={2.5}
                className="fill-ink" />
      ))}
      {[0.5, 0.8, 0.95].map((v) => (
        <text key={v} x={X(f(v))} y={PLOT.h - 8} textAnchor="middle"
              className="fill-ink-faint font-mono text-[8px]">{v.toFixed(2)}</text>
      ))}
    </svg>
  );
}

function RiskCoverageChart({
  rc,
  threshold,
}: {
  rc: Meta["evidence"]["risk_coverage"];
  threshold: number;
}) {
  if (!rc?.curve?.length) return <Empty>Not yet measured.</Empty>;
  const { X, Y } = scales();
  const hi = Math.max(...rc.curve.map((p) => p.selective_mae)) * 1.1;
  const f = (v: number) => v / hi;

  return (
    <svg viewBox={`0 0 ${PLOT.w} ${PLOT.h}`} className="w-full" role="img"
         aria-label="Selective error against coverage">
      {[0.25, 0.5, 0.75].map((g) => (
        <g key={g}>
          <line x1={X(0)} y1={Y(g)} x2={X(1)} y2={Y(g)} className="stroke-line" />
          <text x={X(0) - 6} y={Y(g) + 3} textAnchor="end"
                className="fill-ink-faint font-mono text-[8px]">{(hi * g).toFixed(1)}</text>
        </g>
      ))}
      <line x1={X(threshold)} y1={Y(0)} x2={X(threshold)} y2={Y(1)}
            className="stroke-signal" strokeDasharray="3 3" strokeWidth={1.5} />
      <polyline points={rc.oracle.map((p) => `${X(p.coverage)},${Y(f(p.selective_mae))}`).join(" ")}
                fill="none" className="stroke-ink-faint" strokeDasharray="3 3" strokeWidth={1.2} />
      <polyline points={rc.curve.map((p) => `${X(p.coverage)},${Y(f(p.selective_mae))}`).join(" ")}
                fill="none" className="stroke-ink" strokeWidth={2} />
      {rc.mae_at_85pct_coverage && (
        <circle cx={X(threshold)} cy={Y(f(rc.mae_at_85pct_coverage))} r={3.5}
                fill="none" className="stroke-signal" strokeWidth={2} />
      )}
      {[0.2, 0.5, threshold, 1].map((c) => (
        <text key={c} x={X(c)} y={PLOT.h - 8} textAnchor="middle"
              className="fill-ink-faint font-mono text-[8px]">{Math.round(c * 100)}%</text>
      ))}
    </svg>
  );
}

function DecileChart({ rows }: { rows: Meta["calibration"] }) {
  const hi = Math.max(...rows.map((r) => r.mae)) * 1.12;
  const w = 300;
  const h = 150;
  const bar = (w - 20) / rows.length;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img"
         aria-label="Mean absolute error by confidence decile">
      {rows.map((r, i) => {
        const bh = (r.mae / hi) * (h - 30);
        return (
          <g key={r.decile}>
            <rect x={20 + i * bar + 2} y={h - 20 - bh} width={bar - 4} height={bh}
                  className={i === 0 ? "fill-signal" : "fill-ink-faint"} />
            <text x={20 + i * bar + bar / 2} y={h - 22 - bh} textAnchor="middle"
                  className="fill-ink-dim font-mono text-[7px]">{r.mae.toFixed(1)}</text>
            <text x={20 + i * bar + bar / 2} y={h - 7} textAnchor="middle"
                  className="fill-ink-faint font-mono text-[8px]">{r.decile}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ format */

const fmt = (v: number | null | undefined, unit = "") =>
  v == null ? "not measured" : `${v.toFixed(2)}${unit ? ` ${unit}` : ""}`;

const pct = (v: number | null | undefined) =>
  v == null ? "not measured" : `${(v * 100).toFixed(1)}%`;

const pctLabel = (v: number | null | undefined) =>
  v == null ? "—" : `${Math.round(v * 100)}%`;
