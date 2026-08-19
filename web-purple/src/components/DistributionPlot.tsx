import React from "react";

interface DistributionPlotProps {
  probabilities?: number[];
  estimate: number | null;
  interval: [number, number] | null;
  policyMin?: number;
  policyMax?: number;
}

export const DistributionPlot: React.FC<DistributionPlotProps> = ({
  probabilities,
  estimate,
  interval,
  policyMin = 18,
  policyMax = 64,
}) => {
  if (!probabilities || probabilities.length === 0) {
    return null;
  }

  const maxProb = Math.max(...probabilities, 0.05);

  // SVG dimensions
  const width = 600;
  const height = 140;
  const padding = { top: 15, right: 15, bottom: 25, left: 35 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const xScale = (age: number) => padding.left + ((age - 1) / 99) * plotWidth;
  const yScale = (p: number) => padding.top + plotHeight - (p / maxProb) * plotHeight;

  // Build SVG Path
  const points = probabilities.map((p, idx) => {
    const age = idx + 1;
    return `${xScale(age)},${yScale(p)}`;
  });
  const pathD = `M ${xScale(1)},${yScale(0)} L ${points.join(" L ")} L ${xScale(100)},${yScale(0)} Z`;
  const lineD = `M ${points.join(" L ")}`;

  // Policy shaded zone
  const polLeft = Math.max(1, policyMin);
  const polRight = Math.min(100, policyMax);
  const polX = xScale(polLeft);
  const polW = xScale(polRight) - polX;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Soft-Label Probability Head
          </span>
          <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
            100 Age Bins · Expected Value E[age]
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-cyan-400">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            Posterior PDF
          </span>
          <span className="flex items-center gap-1 text-emerald-400/80">
            <span className="h-2 w-2 rounded bg-emerald-500/20 border border-emerald-500/40" />
            Eligible Envelope ({policyMin}-{policyMax})
          </span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-lg bg-slate-950/90 border border-slate-800/80 p-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          style={{ maxHeight: "160px" }}
        >
          <defs>
            <linearGradient id="probGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => (
            <line
              key={frac}
              x1={padding.left}
              y1={padding.top + plotHeight * frac}
              x2={width - padding.right}
              y2={padding.top + plotHeight * frac}
              stroke="#1e293b"
              strokeDasharray="2,2"
            />
          ))}

          {/* Policy eligibility zone */}
          <rect
            x={polX}
            y={padding.top}
            width={polW}
            height={plotHeight}
            fill="#10b981"
            fillOpacity="0.06"
          />

          {/* Age axis labels */}
          {[1, 18, 30, 50, 65, 80, 100].map((age) => (
            <g key={age} transform={`translate(${xScale(age)}, 0)`}>
              <line
                y1={padding.top + plotHeight}
                y2={padding.top + plotHeight + 4}
                stroke="#475569"
              />
              <text
                y={padding.top + plotHeight + 15}
                textAnchor="middle"
                className="fill-slate-500 font-mono text-[9px]"
              >
                {age}
              </text>
            </g>
          ))}

          {/* 80% Credible Interval Shading */}
          {interval && (
            <rect
              x={xScale(interval[0])}
              y={padding.top}
              width={Math.max(2, xScale(interval[1]) - xScale(interval[0]))}
              height={plotHeight}
              fill="#38bdf8"
              fillOpacity="0.15"
            />
          )}

          {/* Distribution Area & Line */}
          <path d={pathD} fill="url(#probGradient)" />
          <path d={lineD} fill="none" stroke="#06b6d4" strokeWidth="2" />

          {/* Estimate line */}
          {estimate !== null && (
            <g>
              <line
                x1={xScale(estimate)}
                y1={padding.top}
                x2={xScale(estimate)}
                y2={padding.top + plotHeight}
                stroke="#38bdf8"
                strokeWidth="2"
                strokeDasharray="3,3"
              />
              <circle
                cx={xScale(estimate)}
                cy={yScale(probabilities[Math.min(99, Math.max(0, Math.round(estimate) - 1))])}
                r="4"
                fill="#38bdf8"
                stroke="#030712"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
