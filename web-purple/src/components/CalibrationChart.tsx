import React from "react";
import type { CalibrationPoint } from "../types/npn";

interface CalibrationChartProps {
  points: CalibrationPoint[];
}

export const CalibrationChart: React.FC<CalibrationChartProps> = ({ points }) => {
  const width = 450;
  const height = 240;
  const pad = { top: 20, right: 30, bottom: 40, left: 45 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const xScale = (nom: number) => pad.left + nom * w;
  const yScale = (emp: number) => pad.top + h - emp * h;

  // Build empirical curve points
  const sorted = [...points].sort((a, b) => a.nominal - b.nominal);
  const pathD = sorted.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.nominal)} ${yScale(p.empirical)}`).join(" ");

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Interval Calibration (Empirical vs Nominal)
          </h4>
          <p className="text-[11px] text-slate-400">
            Assessing if an 80% credible interval holds true 80% of the time
          </p>
        </div>
        <span className="rounded bg-cyan-950 px-2 py-0.5 font-mono text-[10px] text-cyan-400 border border-cyan-800/40">
          N = 47,568 Held-Out
        </span>
      </div>

      <div className="relative w-full overflow-hidden rounded-lg bg-slate-950/80 p-2 border border-slate-800/80">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {/* Grid lines */}
          {[0.2, 0.4, 0.6, 0.8, 1.0].map((v) => (
            <g key={v}>
              <line
                x1={pad.left}
                y1={yScale(v)}
                x2={width - pad.right}
                y2={yScale(v)}
                stroke="#1e293b"
                strokeDasharray="2,2"
              />
              <line
                x1={xScale(v)}
                y1={pad.top}
                x2={xScale(v)}
                y2={pad.top + h}
                stroke="#1e293b"
                strokeDasharray="2,2"
              />
              {/* Y axis labels */}
              <text
                x={pad.left - 8}
                y={yScale(v) + 3}
                textAnchor="end"
                className="fill-slate-500 font-mono text-[9px]"
              >
                {(v * 100).toFixed(0)}%
              </text>
              {/* X axis labels */}
              <text
                x={xScale(v)}
                y={pad.top + h + 18}
                textAnchor="middle"
                className="fill-slate-500 font-mono text-[9px]"
              >
                {(v * 100).toFixed(0)}%
              </text>
            </g>
          ))}

          {/* Diagonal Ideal Line */}
          <line
            x1={xScale(0)}
            y1={yScale(0)}
            x2={xScale(1)}
            y2={yScale(1)}
            stroke="#475569"
            strokeWidth="1.5"
            strokeDasharray="4,4"
          />

          {/* Empirical curve */}
          <path d={pathD} fill="none" stroke="#06b6d4" strokeWidth="2.5" />

          {/* Empirical Points & Tooltip Dots */}
          {sorted.map((p) => {
            const cx = xScale(p.nominal);
            const cy = yScale(p.empirical);
            const isTarget80 = p.nominal === 0.8;

            return (
              <g key={p.nominal}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isTarget80 ? 5 : 3.5}
                  fill={isTarget80 ? "#38bdf8" : "#06b6d4"}
                  stroke="#030712"
                  strokeWidth="1.5"
                />
                {isTarget80 && (
                  <text
                    x={cx + 8}
                    y={cy - 6}
                    className="fill-cyan-300 font-mono text-[9px] font-bold"
                  >
                    Nom 80% → Emp {(p.empirical * 100).toFixed(1)}%
                  </text>
                )}
              </g>
            );
          })}

          {/* Axis Titles */}
          <text
            x={pad.left + w / 2}
            y={height - 5}
            textAnchor="middle"
            className="fill-slate-400 text-[10px] font-medium"
          >
            Nominal Stated Credible Level
          </text>
          <text
            transform={`rotate(-90) translate(-${pad.top + h / 2}, 12)`}
            textAnchor="middle"
            className="fill-slate-400 text-[10px] font-medium"
          >
            Empirical Coverage Rate
          </text>
        </svg>
      </div>

      {/* Summary table */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-1 text-center font-mono">
        {sorted.map((p) => (
          <div
            key={p.nominal}
            className={`rounded border p-1.5 ${
              p.nominal === 0.8
                ? "border-cyan-500/50 bg-cyan-950/40 text-cyan-300"
                : "border-slate-800 bg-slate-950/40 text-slate-400"
            }`}
          >
            <div className="text-[9px] text-slate-500">{(p.nominal * 100).toFixed(0)}% Interval</div>
            <div className="text-xs font-bold text-slate-200">{(p.empirical * 100).toFixed(1)}%</div>
            <div className={`text-[9px] ${p.gap >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
              {p.gap >= 0 ? "+" : ""}{(p.gap * 100).toFixed(1)}% gap
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
