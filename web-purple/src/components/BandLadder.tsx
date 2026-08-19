import React from "react";
import type { AgeBand } from "../types/npn";
import { getBoundaries, straddlesBoundary } from "../lib/simulator";
import { AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";

interface BandLadderProps {
  bands: AgeBand[];
  estimate: number | null;
  interval: [number, number] | null;
  highlightStraddle?: boolean;
}

export const BandLadder: React.FC<BandLadderProps> = ({
  bands,
  estimate,
  interval,
  highlightStraddle = true,
}) => {
  const boundaries = getBoundaries();
  const isStraddling = interval ? straddlesBoundary(interval) : false;

  // Scale: 0 to 100
  const maxScale = 100;
  const toPct = (age: number) => Math.max(0, Math.min(100, (age / maxScale) * 100));

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Clinical Band Ladder
          </span>
          <span className="rounded bg-cyan-950/80 px-2 py-0.5 font-mono text-[10px] text-cyan-400 border border-cyan-800/40">
            5 Lifespan Tiers
          </span>
        </div>

        {interval && isStraddling && highlightStraddle && (
          <div className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400 animate-pulse">
            <ShieldAlert className="size-3.5" />
            <span>Interval Straddles Clinical Boundary</span>
          </div>
        )}

        {interval && !isStraddling && estimate !== null && (
          <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            <span>Decisive Band Containment</span>
          </div>
        )}
      </div>

      {/* Main Track Visualizer */}
      <div className="relative mt-4 mb-3 h-14 w-full rounded-lg bg-slate-950/80 p-1.5 border border-slate-800/80">
        {/* Band Sections */}
        <div className="relative flex h-full w-full overflow-hidden rounded">
          {bands.map((b) => {
            const widthPct = ((Math.min(b.max, 100) - b.min) / maxScale) * 100;
            const isTargetBand =
              estimate !== null && estimate >= b.min && estimate <= b.max;

            return (
              <div
                key={b.id}
                style={{ width: `${widthPct}%` }}
                className={`relative flex h-full flex-col justify-between border-r border-slate-800/80 px-2 py-1 transition-all ${
                  isTargetBand
                    ? "bg-cyan-500/20 border-cyan-500/50 shadow-inner"
                    : "bg-slate-900/40 hover:bg-slate-800/30"
                }`}
              >
                <span className="truncate text-[10px] font-semibold text-slate-300">
                  {b.label.split(" ")[0]}
                </span>
                <span className="num-mono text-[9px] text-slate-500">
                  {b.min}-{b.max === 120 ? "100+" : b.max}
                </span>
              </div>
            );
          })}
        </div>

        {/* Boundary Edge Markers */}
        {boundaries.map((edge) => {
          const crossed =
            interval && interval[0] < edge && edge < interval[1];

          return (
            <div
              key={edge}
              style={{ left: `${toPct(edge)}%` }}
              className={`absolute top-0 bottom-0 z-10 w-0.5 -translate-x-1/2 transition-colors ${
                crossed
                  ? "bg-amber-400 shadow-[0_0_8px_#f59e0b]"
                  : "bg-slate-700/60"
              }`}
            >
              <div
                className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded px-1 py-0.2 font-mono text-[8px] font-bold ${
                  crossed
                    ? "bg-amber-500 text-slate-950 font-bold"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {edge}
              </div>
            </div>
          );
        })}

        {/* Credible Interval Span Bracket */}
        {interval && (
          <div
            style={{
              left: `${toPct(interval[0])}%`,
              width: `${Math.max(2, toPct(interval[1]) - toPct(interval[0]))}%`,
            }}
            className={`absolute top-2 bottom-2 z-20 rounded border-y-2 pointer-events-none transition-all ${
              isStraddling
                ? "border-amber-400/80 bg-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                : "border-cyan-400/80 bg-cyan-500/20 shadow-[0_0_12px_rgba(6,182,212,0.3)]"
            }`}
          >
            {/* Interval End Caps */}
            <div
              className={`absolute top-0 -left-1 h-full w-1 rounded-l ${
                isStraddling ? "bg-amber-400" : "bg-cyan-400"
              }`}
            />
            <div
              className={`absolute top-0 -right-1 h-full w-1 rounded-r ${
                isStraddling ? "bg-amber-400" : "bg-cyan-400"
              }`}
            />
          </div>
        )}

        {/* Point Estimate Needle */}
        {estimate !== null && (
          <div
            style={{ left: `${toPct(estimate)}%` }}
            className="absolute top-[-4px] bottom-[-4px] z-30 flex flex-col items-center -translate-x-1/2 pointer-events-none"
          >
            <div className="h-2 w-2 rotate-45 bg-cyan-300 shadow-[0_0_8px_#38bdf8]" />
            <div className="w-0.5 flex-1 bg-cyan-300 shadow-[0_0_6px_#38bdf8]" />
            <div className="h-2 w-2 rotate-45 bg-cyan-300 shadow-[0_0_8px_#38bdf8]" />
          </div>
        )}
      </div>

      {/* Interval Readout Details */}
      {interval && estimate !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Point Estimate:</span>
              <span className="num-mono font-bold text-cyan-300">
                {estimate.toFixed(1)} yr
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">80% Credible Interval:</span>
              <span className="num-mono font-medium text-slate-200">
                [{interval[0].toFixed(1)} – {interval[1].toFixed(1)}] yr
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Span Width:</span>
              <span className="num-mono text-slate-300">
                ±{((interval[1] - interval[0]) / 2).toFixed(1)} yr
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400">
            {isStraddling ? (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertCircle className="size-3" />
                Uncertainty crosses boundary — requires human adjudication
              </span>
            ) : (
              <span className="text-emerald-400">
                100% contained in single clinical band
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
