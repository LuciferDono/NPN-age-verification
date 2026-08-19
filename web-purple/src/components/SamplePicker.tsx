import React from "react";
import { PRESET_SAMPLES } from "../lib/datasets";
import { UserCheck, ShieldAlert, AlertTriangle, Sparkles } from "lucide-react";

interface SamplePickerProps {
  selectedId: string | null;
  onSelectSample: (sample: (typeof PRESET_SAMPLES)[0]) => void;
}

export const SamplePicker: React.FC<SamplePickerProps> = ({
  selectedId,
  onSelectSample,
}) => {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Held-Out Benchmark Samples
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">
          Pre-vetted Fixed Cohort
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-1">
        {PRESET_SAMPLES.map((sample) => {
          const isSelected = selectedId === sample.id;
          const isReview = sample.expectedOutcome === "review";
          const isRejected = sample.expectedOutcome === "rejected";

          return (
            <button
              key={sample.id}
              onClick={() => onSelectSample(sample)}
              className={`group relative flex flex-col items-center rounded-lg border p-2 text-left transition-all ${
                isSelected
                  ? "border-cyan-500 bg-cyan-950/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                  : "border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-800/40"
              }`}
            >
              {/* Image Thumbnail */}
              <div className="relative aspect-square w-full overflow-hidden rounded-md bg-slate-900 border border-slate-800">
                <img
                  src={sample.path}
                  alt={sample.title}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  onError={(e) => {
                    // Fallback to placeholder if not found
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />

                {/* Outcome Badge */}
                <div className="absolute top-1 right-1">
                  {isReview && (
                    <span className="flex items-center gap-0.5 rounded bg-amber-500/90 px-1 py-0.2 text-[8px] font-bold text-slate-950">
                      <ShieldAlert className="size-2.5" />
                      STRADDLE
                    </span>
                  )}
                  {isRejected && (
                    <span className="flex items-center gap-0.5 rounded bg-rose-500/90 px-1 py-0.2 text-[8px] font-bold text-slate-950">
                      <AlertTriangle className="size-2.5" />
                      EXCLUDED
                    </span>
                  )}
                  {!isReview && !isRejected && (
                    <span className="flex items-center gap-0.5 rounded bg-emerald-500/90 px-1 py-0.2 text-[8px] font-bold text-slate-950">
                      <UserCheck className="size-2.5" />
                      ELIGIBLE
                    </span>
                  )}
                </div>
              </div>

              {/* Title & Age info */}
              <div className="mt-2 w-full">
                <div className="flex items-center justify-between">
                  <span className="truncate text-xs font-semibold text-slate-200">
                    {sample.title.split(" ")[0]}
                  </span>
                  <span className="num-mono text-[11px] font-bold text-cyan-400">
                    {sample.age} yr
                  </span>
                </div>
                <p className="line-clamp-1 text-[10px] text-slate-400">
                  {sample.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
