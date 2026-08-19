import React from "react";
import type { Meta } from "../types/npn";
import { DecileChart } from "../components/DecileChart";
import { RiskCoverageChart } from "../components/RiskCoverageChart";
import {
  CALIBRATION_CURVE,
  CONFIDENCE_DECILES,
  METRICS_DATA,
  RISK_COVERAGE_DATA,
  TRAINING_LOGS,
} from "../lib/datasets";
import {
  BarChart3,
  CheckCircle2,
  TrendingDown,
  LineChart,
  Layers,
  Award,
} from "lucide-react";

interface EvidenceViewProps {
  meta: Meta | null;
}

export const EvidenceView: React.FC<EvidenceViewProps> = ({ meta }) => {
  const m = meta?.metrics || METRICS_DATA;
  const bands = m?.per_band_mae || METRICS_DATA.per_band_mae || [];

  return (
    <div className="space-y-6">
      {/* Primary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold uppercase">Held-Out MAE</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.2 font-mono text-[9px] text-cyan-400 border border-slate-700">
              N = 47,568
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="num-mono text-3xl font-bold text-cyan-400">
              {m.mae ? m.mae.toFixed(2) : "5.64"}
            </span>
            <span className="text-xs text-slate-400">yr</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">
            Mean absolute error on test split
          </span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold uppercase">Within 5 Years (CS@5)</span>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="num-mono text-3xl font-bold text-emerald-400">
              {m.cs5 ? (m.cs5 * 100).toFixed(1) : "59.3"}
            </span>
            <span className="text-xs text-slate-400">%</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">
            Estimates within &plusmn;5 years of true age
          </span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold uppercase">Band Accuracy</span>
            <Award className="size-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="num-mono text-3xl font-bold text-slate-100">
              {m.band_accuracy ? (m.band_accuracy * 100).toFixed(1) : "66.8"}
            </span>
            <span className="text-xs text-slate-400">%</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">
            Exact clinical band classification
          </span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold uppercase">Naive Mean Baseline</span>
            <TrendingDown className="size-4 text-slate-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="num-mono text-3xl font-bold text-slate-300">
              {m.baseline_mae ? m.baseline_mae.toFixed(2) : "11.34"}
            </span>
            <span className="text-xs text-slate-400">yr</span>
          </div>
          <span className="text-[10px] text-emerald-400 mt-1 block">
            Model reduces error by &gt; 50%
          </span>
        </div>
      </div>

      {/* Accuracy Breakdown by Age Band */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-cyan-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Accuracy by Clinical Age Cohort
            </h4>
          </div>
          <span className="text-[10px] font-mono text-slate-500">Held-Out Test Partition</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {bands.map((b) => (
            <div
              key={b.band}
              className="rounded-lg border border-slate-800 bg-slate-950 p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 uppercase">
                  {b.band.replace(/_/g, " ")}
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  N = {b.n.toLocaleString()}
                </span>
              </div>

              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="num-mono text-xl font-bold text-cyan-400">
                    {b.mae ? b.mae.toFixed(2) : "—"}
                  </span>
                  <span className="text-xs text-slate-400">yr MAE</span>
                </div>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded bg-slate-900">
                <div
                  style={{ width: `${Math.min(100, ((b.mae || 5) / 16) * 100)}%` }}
                  className="h-full bg-cyan-500 rounded"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Charts: Decile Error & Risk Coverage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DecileChart />
        <RiskCoverageChart rc={meta?.evidence?.risk_coverage || RISK_COVERAGE_DATA} />
      </div>

      {/* Deciles & Training Loss Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Confidence Deciles Breakdown */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-cyan-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Confidence Decile Breakdown
              </h4>
            </div>
            <span className="font-mono text-[10px] text-slate-500">10 Decile Partitions</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                  <th className="py-2 px-2">Decile</th>
                  <th className="py-2 px-2">Confidence Range</th>
                  <th className="py-2 px-2 text-right">MAE (yr)</th>
                  <th className="py-2 px-2 text-right">Routing Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px]">
                {CONFIDENCE_DECILES.map((d) => {
                  const isBottom = d.decile <= 2;
                  return (
                    <tr
                      key={d.decile}
                      className={`hover:bg-slate-800/30 ${
                        isBottom ? "bg-amber-950/20 text-amber-300" : "text-slate-300"
                      }`}
                    >
                      <td className="py-2 px-2 font-bold">Decile {d.decile}</td>
                      <td className="py-2 px-2 text-slate-400">
                        [{d.conf_min.toFixed(3)} – {d.conf_max.toFixed(3)}]
                      </td>
                      <td className="py-2 px-2 text-right font-bold">
                        {d.mae.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {isBottom ? (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-amber-300">
                            REVIEW TIER
                          </span>
                        ) : (
                          <span className="text-[9px] text-emerald-400">AUTOMATED</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Training Loss Table */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LineChart className="size-4 text-cyan-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Training Trajectory (12 Epochs)
              </h4>
            </div>
            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-emerald-400 border border-slate-700">
              Optimal: Epoch 7
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                  <th className="py-2 px-2">Epoch</th>
                  <th className="py-2 px-2">Train Loss</th>
                  <th className="py-2 px-2">Val Loss</th>
                  <th className="py-2 px-2 text-right">Val MAE</th>
                  <th className="py-2 px-2 text-right">Checkpoint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px]">
                {TRAINING_LOGS.map((t) => (
                  <tr
                    key={t.epoch}
                    className={`hover:bg-slate-800/30 ${
                      t.is_best ? "bg-emerald-950/30 text-emerald-300 font-bold" : "text-slate-300"
                    }`}
                  >
                    <td className="py-2 px-2">Epoch {t.epoch}</td>
                    <td className="py-2 px-2 text-slate-400">{t.train_loss.toFixed(2)}</td>
                    <td className="py-2 px-2 text-slate-400">{t.val_loss.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-bold">{t.val_mae.toFixed(2)} yr</td>
                    <td className="py-2 px-2 text-right">
                      {t.is_best ? (
                        <span className="rounded bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 text-[9px] font-bold">
                          DEPLOYED
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
