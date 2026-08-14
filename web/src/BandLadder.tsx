import type { Band } from "./api";

/**
 * The band ladder — the one view that explains a decision rather than announcing it.
 *
 * Draws the clinical band scale, overlays the prediction interval on it, and marks
 * the point estimate. When the interval crosses a band boundary, that boundary lights
 * amber: the panel can see at a glance that the model's uncertainty, not its estimate,
 * is what sent the case to review. A number alone cannot show that.
 */
export function BandLadder({
  bands,
  age,
  interval,
  straddled,
}: {
  bands: Band[];
  age: number | null;
  interval: [number, number] | null;
  straddled: boolean;
}) {
  if (!bands.length) return null;

  const lo = bands[0].min;
  const hi = Math.min(bands[bands.length - 1].max, 100);
  const span = hi - lo || 1;
  const pct = (v: number) => ((Math.min(Math.max(v, lo), hi) - lo) / span) * 100;

  const edges = bands.slice(1).map((b) => b.min);
  const crossed = interval ? edges.filter((e) => interval[0] < e && e < interval[1]) : [];

  return (
    <div className="select-none">
      {/* band names */}
      <div className="relative mb-1.5 h-3">
        {bands.map((b) => {
          const left = pct(b.min);
          const width = pct(Math.min(b.max, hi)) - left;
          return (
            <div
              key={b.id}
              style={{ left: `${left}%`, width: `${width}%` }}
              className="absolute top-0 truncate px-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint"
            >
              {b.label.replace(/\s*\(.*\)$/, "")}
            </div>
          );
        })}
      </div>

      {/* the track */}
      <div className="relative h-9 border border-line bg-raised">
        {/* band separators */}
        {edges.map((e) => (
          <div
            key={e}
            style={{ left: `${pct(e)}%` }}
            className={`absolute top-0 h-full w-px ${
              crossed.includes(e) ? "bg-signal" : "bg-line-strong"
            }`}
          />
        ))}

        {/* prediction interval */}
        {interval && (
          <div
            style={{ left: `${pct(interval[0])}%`, width: `${pct(interval[1]) - pct(interval[0])}%` }}
            className={`absolute inset-y-1 border-x ${
              straddled
                ? "border-signal bg-signal/15"
                : "border-ink-faint bg-ink-faint/10"
            }`}
          />
        )}

        {/* point estimate */}
        {age !== null && (
          <div style={{ left: `${pct(age)}%` }} className="absolute inset-y-0 w-px bg-ink">
            <div className="absolute -top-px left-1/2 size-1.5 -translate-x-1/2 bg-ink" />
          </div>
        )}
      </div>

      {/* axis */}
      <div className="relative mt-1 h-3">
        {[lo, ...edges, hi].map((v) => (
          <div
            key={v}
            style={{ left: `${pct(v)}%` }}
            className="absolute top-0 -translate-x-1/2 font-mono text-[9px] text-ink-faint tabular-nums"
          >
            {v}
          </div>
        ))}
      </div>

      {straddled && (
        <p className="mt-2 border-l-2 border-signal pl-2 text-[11px] leading-snug text-signal">
          Interval crosses a band boundary at {crossed.join(", ")}. Band assignment is not
          decisive — routed to human review.
        </p>
      )}
    </div>
  );
}

/**
 * Confidence percentile against the review threshold. Percentile, not raw confidence,
 * because the routing rule is a percentile — the scale shows the rule that actually ran.
 */
export function ConfidenceScale({
  percentile,
  threshold,
  confidence,
}: {
  percentile: number | null;
  threshold: number;
  confidence: number | null;
}) {
  const below = percentile !== null && percentile <= threshold;
  return (
    <div className="select-none">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="label">Confidence percentile</span>
        <span className={`font-mono text-xs tabular-nums ${below ? "text-signal" : "text-ink-dim"}`}>
          {percentile === null ? "—" : `p${(percentile * 100).toFixed(0)}`}
          {confidence !== null && (
            <span className="ml-2 text-ink-faint">raw {confidence.toFixed(3)}</span>
          )}
        </span>
      </div>

      <div className="relative h-6 border border-line bg-raised">
        {/* review zone */}
        <div
          style={{ width: `${threshold * 100}%` }}
          className="absolute inset-y-0 left-0 border-r border-signal bg-signal/12"
        />
        {/* needle */}
        {percentile !== null && (
          <div
            style={{ left: `${percentile * 100}%` }}
            className={`absolute inset-y-0 w-px ${below ? "bg-signal" : "bg-ink"}`}
          />
        )}
      </div>

      <div className="mt-1 flex justify-between font-mono text-[9px] text-ink-faint tabular-nums">
        <span>review ≤ p{(threshold * 100).toFixed(0)}</span>
        <span>p100</span>
      </div>
    </div>
  );
}
