import React, { useState } from "react";
import type { FairnessData } from "../types/npn";
import { AlertTriangle, Users, Scale, HelpCircle } from "lucide-react";

interface FairnessMatrixProps {
  data: FairnessData;
}

export const FairnessMatrix: React.FC<FairnessMatrixProps> = ({ data }) => {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const bands = ["0-17", "18-29", "30-49", "50-64", "65+"];
  const races = ["Asian", "Other", "White", "Indian", "Black"];

  // Find min/max MAE for heatmap color scaling
  const validMaes = data.intersectional
    .map((c) => c.mae)
    .filter((m): m is number => m !== null);
  const minMae = Math.min(...validMaes, 1.4);
  const maxMae = Math.max(...validMaes, 12.0);

  const getHeatmapColor = (val: number | null) => {
    if (val === null) return "bg-slate-900 text-slate-600";
    const ratio = (val - minMae) / (maxMae - minMae);
    if (ratio < 0.25) return "bg-emerald-950/80 text-emerald-300 border-emerald-800/40";
    if (ratio < 0.50) return "bg-cyan-950/80 text-cyan-300 border-cyan-800/40";
    if (ratio < 0.75) return "bg-amber-950/80 text-amber-300 border-amber-800/40";
    return "bg-rose-950/90 text-rose-300 border-rose-800/60 shadow-[0_0_10px_rgba(244,63,94,0.2)]";
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Overview Notice */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 backdrop-blur-md">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Ethical Disclosure & Demographic Audit (UTKFace N=23,684)
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {data.caveat} Evaluated out-of-distribution across all 23,684 UTKFace benchmark images.
              Black subjects exhibit higher error margins across 4 of 5 age bands, notably in the
              paediatric eligibility tier (0-17). Clinical guardrails enforce automatic human review
              for all edge cases.
            </p>
          </div>
        </div>
      </div>

      {/* High-Level Cohort Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By Race */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-cyan-400" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Performance by Racial Cohort
              </h4>
            </div>
            <span className="text-[10px] font-mono text-slate-500">95% Bootstrap CI</span>
          </div>

          <div className="space-y-2.5">
            {data.by_race.map((r) => {
              const barWidth = ((r.mae / 7.0) * 100).toFixed(0);
              const isHighDisparity = r.group === "Black";

              return (
                <div key={r.group} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300 flex items-center gap-1.5">
                      {r.group}
                      <span className="text-[10px] text-slate-500">
                        (N = {r.n.toLocaleString()})
                      </span>
                    </span>
                    <span className="num-mono font-bold text-slate-200">
                      {r.mae.toFixed(2)} yr{" "}
                      <span className="text-[10px] text-slate-500 font-normal">
                        [{r.ci_low.toFixed(2)} – {r.ci_high.toFixed(2)}]
                      </span>
                    </span>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded bg-slate-950">
                    <div
                      style={{ width: `${barWidth}%` }}
                      className={`h-full rounded transition-all ${
                        isHighDisparity
                          ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                          : "bg-cyan-500"
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Gender */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Scale className="size-4 text-cyan-400" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Performance by Gender
              </h4>
            </div>
            <span className="text-[10px] font-mono text-slate-500">N = 23,684</span>
          </div>

          <div className="space-y-4">
            {data.by_gender.map((g) => (
              <div key={g.group} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">
                    {g.group} Cohort{" "}
                    <span className="text-[10px] text-slate-500">
                      (N = {g.n.toLocaleString()})
                    </span>
                  </span>
                  <span className="num-mono font-bold text-cyan-300">
                    {g.mae.toFixed(2)} yr{" "}
                    <span className="text-[10px] text-slate-500 font-normal">
                      [{g.ci_low.toFixed(2)} – {g.ci_high.toFixed(2)}]
                    </span>
                  </span>
                </div>

                <div className="h-2.5 w-full overflow-hidden rounded bg-slate-950">
                  <div
                    style={{ width: `${((g.mae / 7.0) * 100).toFixed(0)}%` }}
                    className="h-full bg-cyan-500 rounded"
                  />
                </div>
              </div>
            ))}

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-400 space-y-1">
              <span className="font-semibold text-slate-300 block">Overall Benchmark</span>
              <p>
                Overall Held-Out MAE: <span className="font-mono text-slate-200 font-bold">{data.overall_mae.toFixed(2)} yr</span>{" "}
                (95% CI: [{data.overall_ci[0]} – {data.overall_ci[1]}])
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Intersectional Heatmap Matrix (Race x Age Band) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Intersectional Disparity Matrix (Race × Age Band MAE)
            </h4>
            <p className="text-[11px] text-slate-400">
              Within-band error rates reveal where demographic gaps concentrate
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="h-2 w-2 rounded bg-emerald-500" /> Lower Error (1.4 yr)
            </span>
            <span className="flex items-center gap-1 text-rose-400">
              <span className="h-2 w-2 rounded bg-rose-500" /> Elevated Disparity (12.0 yr)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-2.5 px-3">Racial Cohort</th>
                {bands.map((band) => (
                  <th key={band} className="py-2.5 px-3 text-center">
                    {band} yr
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {races.map((race) => (
                <tr key={race} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-slate-200">{race}</td>
                  {bands.map((band) => {
                    const cell = data.intersectional.find(
                      (c) => c.race === race && c.band === band
                    );
                    const mae = cell?.mae ?? null;
                    const isPediatricBlack = race === "Black" && band === "0-17";

                    return (
                      <td key={band} className="py-2.5 px-2 text-center">
                        <div
                          className={`inline-flex flex-col items-center justify-center rounded-lg border px-3 py-1.5 min-w-[72px] font-mono ${getHeatmapColor(
                            mae
                          )}`}
                        >
                          <span className="font-bold text-xs">
                            {mae !== null ? `${mae.toFixed(2)}y` : "—"}
                          </span>
                          <span className="text-[9px] opacity-75">
                            {cell ? `n=${cell.n}` : ""}
                          </span>
                        </div>
                        {isPediatricBlack && (
                          <div className="mt-1 text-[9px] text-rose-400 font-medium">
                            3.7× best gap
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
