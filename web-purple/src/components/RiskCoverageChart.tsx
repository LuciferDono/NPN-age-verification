import React, { useState } from "react";
import type { RiskCoverage } from "../types/npn";
import { Sliders, ShieldCheck } from "lucide-react";

interface RiskCoverageChartProps {
  rc?: RiskCoverage;
  defaultCoverage?: number;
}

export const RiskCoverageChart: React.FC<RiskCoverageChartProps> = ({
  rc,
  defaultCoverage = 0.85,
}) => {
  const [coverageCutoff, setCoverageCutoff] = useState(defaultCoverage);

  if (!rc || !rc.curve.length) return null;

  const width = 450;
  const height = 240;
  const pad = { top: 20, right: 30, bottom: 40, left: 45 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const maxMae = 6.5;
  const xScale = (c: number) => pad.left + c * w;
  const yScale = (mae: number) => pad.top + h - (mae / maxMae) * h;

  const points = rc.curve;
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.coverage)} ${yScale(p.selective_mae)}`)
    .join(" ");

  // Interpolate MAE at current cutoff
  const nearest = points.reduce((prev, curr) =>
    Math.abs(curr.coverage - coverageCutoff) < Math.abs(prev.coverage - coverageCutoff) ? curr : prev
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Selective Prediction & Review Deferral
          </h4>
          <p className="text-[11px] text-slate-400">
            Error reduction as least-confident predictions are routed to human review
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded bg-amber-950/80 px-2 py-0.5 font-mono text-[10px] text-amber-400 border border-amber-800/40">
          <ShieldCheck className="size-3" />
          Queue Efficiency
        </div>
      </div>

      {/* Interactive Slider */}
      <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-950/60 p-2.5 border border-slate-800">
        <div className="flex items-center gap-2">
          <Sliders className="size-4 text-cyan-400" />
          <span className="text-xs text-slate-300">Automated Coverage:</span>
          <span className="font-mono text-xs font-bold text-cyan-300">
            {(coverageCutoff * 100).toFixed(0)}%
          </span>
        </div>

        <input
          type="range"
          min="0.10"
          max="1.00"
          step="0.05"
          value={coverageCutoff}
          onChange={(e) => setCoverageCutoff(parseFloat(e.target.value))}
          className="w-36 accent-cyan-400 cursor-pointer"
        />

        <div className="text-right">
          <span className="text-[10px] text-slate-500 block">Deferred to Queue</span>
          <span className="font-mono text-xs font-bold text-amber-400">
            {((1 - coverageCutoff) * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-lg bg-slate-950/80 p-2 border border-slate-800/80">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {/* Grid lines */}
          {[1, 2, 3, 4, 5, 6].map((mae) => (
            <g key={mae}>
              <line
                x1={pad.left}
                y1={yScale(mae)}
                x2={width - pad.right}
                y2={yScale(mae)}
                stroke="#1e293b"
                strokeDasharray="2,2"
              />
              <text
                x={pad.left - 8}
                y={yScale(mae) + 3}
                textAnchor="end"
                className="fill-slate-500 font-mono text-[9px]"
              >
                {mae}y
              </text>
            </g>
          ))}

          {[0.2, 0.4, 0.6, 0.8, 1.0].map((c) => (
            <g key={c}>
              <line
                x1={xScale(c)}
                y1={pad.top}
                x2={xScale(c)}
                y2={pad.top + h}
                stroke="#1e293b"
                strokeDasharray="2,2"
              />
              <text
                x={xScale(c)}
                y={pad.top + h + 18}
                textAnchor="middle"
                className="fill-slate-500 font-mono text-[9px]"
              >
                {(c * 100).toFixed(0)}%
              </text>
            </g>
          ))}

          {/* Deferral shaded area */}
          <rect
            x={xScale(coverageCutoff)}
            y={pad.top}
            width={width - pad.right - xScale(coverageCutoff)}
            height={h}
            fill="#f59e0b"
            fillOpacity="0.08"
          />

          {/* Risk-Coverage Line */}
          <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="2.5" />

          {/* Active Cutoff Marker */}
          <line
            x1={xScale(coverageCutoff)}
            y1={pad.top}
            x2={xScale(coverageCutoff)}
            y2={pad.top + h}
            stroke="#f59e0b"
            strokeWidth="2"
            strokeDasharray="3,3"
          />

          <circle
            cx={xScale(nearest.coverage)}
            cy={yScale(nearest.selective_mae)}
            r="5"
            fill="#f59e0b"
            stroke="#030712"
            strokeWidth="2"
          />

          <text
            x={xScale(nearest.coverage) - 10}
            y={yScale(nearest.selective_mae) - 10}
            textAnchor="end"
            className="fill-amber-400 font-mono text-[10px] font-bold"
          >
            MAE: {nearest.selective_mae.toFixed(2)} yr
          </text>

          {/* Axis labels */}
          <text
            x={pad.left + w / 2}
            y={height - 5}
            textAnchor="middle"
            className="fill-slate-400 text-[10px] font-medium"
          >
            Coverage (Fraction of Decisions Auto-Resolved)
          </text>
          <text
            transform={`rotate(-90) translate(-${pad.top + h / 2}, 12)`}
            textAnchor="middle"
            className="fill-slate-400 text-[10px] font-medium"
          >
            Selective MAE (Years)
          </text>
        </svg>
      </div>

      {/* Delta impact */}
      <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-xs">
        <div className="text-slate-400">
          Full Coverage Error: <span className="font-mono text-slate-200">{rc.full_coverage_mae.toFixed(2)} yr</span>
        </div>
        <div className="text-slate-400">
          Error on Auto-Decided Cohort:{" "}
          <span className="font-mono font-bold text-cyan-300">{nearest.selective_mae.toFixed(2)} yr</span>
        </div>
        <div className="font-mono text-emerald-400 font-bold">
          -{(rc.full_coverage_mae - nearest.selective_mae).toFixed(2)} yr reduction
        </div>
      </div>
    </div>
  );
};
