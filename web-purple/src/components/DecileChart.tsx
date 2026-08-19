import React from "react";

export interface DecileItem {
  decile: number;
  mae: number;
  conf_min: number;
  conf_max: number;
  n: number;
}

const DECILES_DATA: DecileItem[] = [
  { decile: 1, mae: 10.1, conf_min: 0.0064, conf_max: 0.2066, n: 4756 },
  { decile: 2, mae: 7.9, conf_min: 0.2066, conf_max: 0.2472, n: 4756 },
  { decile: 3, mae: 6.8, conf_min: 0.2473, conf_max: 0.2765, n: 4756 },
  { decile: 4, mae: 6.2, conf_min: 0.2766, conf_max: 0.3002, n: 4756 },
  { decile: 5, mae: 5.5, conf_min: 0.3002, conf_max: 0.3209, n: 4756 },
  { decile: 6, mae: 5.1, conf_min: 0.3209, conf_max: 0.3395, n: 4756 },
  { decile: 7, mae: 4.6, conf_min: 0.3395, conf_max: 0.3578, n: 4756 },
  { decile: 8, mae: 4.0, conf_min: 0.3578, conf_max: 0.3772, n: 4756 },
  { decile: 9, mae: 3.7, conf_min: 0.3772, conf_max: 0.4018, n: 4756 },
  { decile: 10, mae: 2.6, conf_min: 0.4018, conf_max: 0.6940, n: 4764 },
];

export const DecileChart: React.FC<{ items?: DecileItem[] }> = ({ items = DECILES_DATA }) => {
  const maxMae = 12.0;

  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-4">
      {/* Header */}
      <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          ERROR BY CONFIDENCE DECILE
        </h4>
        <span className="font-mono text-[10px] text-slate-500">
          N = 47,568 Held-Out
        </span>
      </div>

      {/* Bar Chart Area */}
      <div className="pt-2 pb-2">
        <div className="flex items-end justify-between gap-2 h-44 px-1">
          {items.map((d) => {
            const heightPct = Math.max(8, (d.mae / maxMae) * 100);
            const isFirst = d.decile === 1;

            return (
              <div
                key={d.decile}
                className="flex-1 flex flex-col items-center justify-end h-full group relative"
              >
                {/* Value Label above Bar */}
                <span className="num-mono text-[11px] font-semibold text-slate-300 mb-1.5 transition-colors group-hover:text-white">
                  {d.mae.toFixed(1)}
                </span>

                {/* Bar */}
                <div
                  style={{ height: `${heightPct}%` }}
                  className={`w-full rounded-t transition-all ${
                    isFirst
                      ? "bg-amber-600 group-hover:bg-amber-500 shadow-sm"
                      : "bg-slate-600 group-hover:bg-slate-500"
                  }`}
                />

                {/* X Axis Label */}
                <span className="num-mono text-xs font-medium text-slate-400 mt-2">
                  {d.decile}
                </span>

                {/* Hover Tooltip */}
                <div className="pointer-events-none absolute -top-12 z-20 hidden group-hover:flex flex-col items-center rounded bg-slate-950 border border-slate-700 px-2 py-1 shadow-lg text-[10px] font-mono whitespace-nowrap">
                  <span className="text-slate-200 font-bold">Decile {d.decile}: {d.mae.toFixed(2)} yr MAE</span>
                  <span className="text-slate-400">Conf: [{d.conf_min.toFixed(3)} - {d.conf_max.toFixed(3)}]</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Explanatory Caption */}
      <div className="border-t border-slate-800/80 pt-3">
        <p className="text-xs text-slate-300 leading-relaxed">
          Sorted from least to most confident. Error falls at every step, so the confidence score ranks the model's own mistakes correctly.
        </p>
      </div>
    </div>
  );
};
