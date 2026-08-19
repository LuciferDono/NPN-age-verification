import React, { useState, useMemo } from "react";
import { Sliders, Activity, Users, ShieldAlert, CheckCircle2, Play, RotateCcw } from "lucide-react";

export const SimulatorView: React.FC = () => {
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(64);
  const [percentileThreshold, setPercentileThreshold] = useState(0.15);
  const [enforceBoundaryStraddle, setEnforceBoundaryStraddle] = useState(true);
  const [cohortSize, setCohortSize] = useState(5000);

  // Run simulation on synthetic cohort
  const simulation = useMemo(() => {
    let reviewCount = 0;
    let autoVerified = 0;
    let autoRejected = 0;

    const boundaries = [18, 30, 50, 65];

    for (let i = 0; i < cohortSize; i++) {
      // Age distribution resembling clinical trial demographics (10-80)
      const age = 12 + Math.random() * 65;
      const spread = 2.5 + Math.random() * 3.5;
      const interval: [number, number] = [age - spread, age + spread];
      const pct = Math.random();

      // Check review rules
      const lowConf = pct <= percentileThreshold;
      const straddles = enforceBoundaryStraddle && boundaries.some((b) => interval[0] < b && b < interval[1]);

      if (lowConf || straddles) {
        reviewCount++;
      } else if (age >= minAge && age <= maxAge) {
        autoVerified++;
      } else {
        autoRejected++;
      }
    }

    const reviewPct = (reviewCount / cohortSize) * 100;
    const autoVerifiedPct = (autoVerified / cohortSize) * 100;
    const autoRejectedPct = (autoRejected / cohortSize) * 100;
    const clinicianHours = (reviewCount * 1.5) / 60; // 1.5 min per review

    return {
      reviewCount,
      autoVerified,
      autoRejected,
      reviewPct,
      autoVerifiedPct,
      autoRejectedPct,
      clinicianHours,
    };
  }, [minAge, maxAge, percentileThreshold, enforceBoundaryStraddle, cohortSize]);

  const resetDefaults = () => {
    setMinAge(18);
    setMaxAge(64);
    setPercentileThreshold(0.15);
    setEnforceBoundaryStraddle(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="size-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100">
              Interactive Policy Simulator & Threshold Lab
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Model the downstream operational workload and safety impact of tuning review thresholds.
          </p>
        </div>

        <button
          onClick={resetDefaults}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
        >
          <RotateCcw className="size-3.5" />
          <span>Reset Defaults</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Controls */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md space-y-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Policy Parameters & Thresholds
            </h3>

            {/* Min Age Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Minimum Eligible Age:</span>
                <span className="num-mono font-bold text-cyan-300 text-sm">{minAge} yr</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                value={minAge}
                onChange={(e) => setMinAge(parseInt(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Max Age Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Maximum Eligible Age:</span>
                <span className="num-mono font-bold text-cyan-300 text-sm">{maxAge} yr</span>
              </div>
              <input
                type="range"
                min="40"
                max="100"
                value={maxAge}
                onChange={(e) => setMaxAge(parseInt(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Review Percentile Threshold */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Review Confidence Percentile Cutoff:</span>
                <span className="num-mono font-bold text-amber-400 text-sm">
                  p{(percentileThreshold * 100).toFixed(0)} ({percentileThreshold.toFixed(2)})
                </span>
              </div>
              <input
                type="range"
                min="0.00"
                max="0.35"
                step="0.01"
                value={percentileThreshold}
                onChange={(e) => setPercentileThreshold(parseFloat(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block">
                Bottom {(percentileThreshold * 100).toFixed(0)}% of validation distribution automatically routed.
              </span>
            </div>

            {/* Boundary Straddling Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  Enforce Boundary Straddle Rule
                </span>
                <span className="text-[10px] text-slate-400">
                  Route cases where credible interval spans [18, 30, 50, 65]
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEnforceBoundaryStraddle(!enforceBoundaryStraddle)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  enforceBoundaryStraddle ? "bg-cyan-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    enforceBoundaryStraddle ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Cohort Size Selector */}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
              <span className="text-slate-400">Simulation Sample Size:</span>
              <select
                value={cohortSize}
                onChange={(e) => setCohortSize(parseInt(e.target.value))}
                className="rounded bg-slate-950 border border-slate-800 px-2 py-1 text-slate-200 text-xs"
              >
                <option value={1000}>1,000 Subjects</option>
                <option value={5000}>5,000 Subjects</option>
                <option value={10000}>10,000 Subjects</option>
                <option value={50000}>50,000 Subjects</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right: Real-Time Projection Output */}
        <div className="lg:col-span-7 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 backdrop-blur-md">
              <span className="text-xs text-amber-400 font-semibold uppercase">Projected Review Load</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="num-mono text-3xl font-black text-amber-300">
                  {simulation.reviewPct.toFixed(1)}
                </span>
                <span className="text-xs text-slate-400 font-semibold">%</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {simulation.reviewCount.toLocaleString()} / {cohortSize.toLocaleString()} cases
              </span>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 backdrop-blur-md">
              <span className="text-xs text-emerald-400 font-semibold uppercase">Auto-Approved</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="num-mono text-3xl font-black text-emerald-400">
                  {simulation.autoVerifiedPct.toFixed(1)}
                </span>
                <span className="text-xs text-slate-400 font-semibold">%</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {simulation.autoVerified.toLocaleString()} cases direct pass
              </span>
            </div>

            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 backdrop-blur-md">
              <span className="text-xs text-cyan-400 font-semibold uppercase">Clinician Workload</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="num-mono text-3xl font-black text-cyan-300">
                  {simulation.clinicianHours.toFixed(1)}
                </span>
                <span className="text-xs text-slate-400 font-semibold">hrs</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Based on 1.5 min / adjudication
              </span>
            </div>
          </div>

          {/* Graphical Triage Breakdown Bar */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Projected Outcome Composition
            </h4>

            <div className="space-y-2">
              <div className="h-6 w-full overflow-hidden rounded-lg bg-slate-950 flex border border-slate-800">
                <div
                  style={{ width: `${simulation.autoVerifiedPct}%` }}
                  className="bg-emerald-500 transition-all flex items-center justify-center text-[10px] font-bold text-slate-950"
                  title="Auto Verified"
                >
                  {simulation.autoVerifiedPct > 15 && `${simulation.autoVerifiedPct.toFixed(0)}%`}
                </div>
                <div
                  style={{ width: `${simulation.reviewPct}%` }}
                  className="bg-amber-500 transition-all flex items-center justify-center text-[10px] font-bold text-slate-950"
                  title="Human Review"
                >
                  {simulation.reviewPct > 15 && `${simulation.reviewPct.toFixed(0)}%`}
                </div>
                <div
                  style={{ width: `${simulation.autoRejectedPct}%` }}
                  className="bg-rose-500 transition-all flex items-center justify-center text-[10px] font-bold text-slate-950"
                  title="Auto Rejected"
                >
                  {simulation.autoRejectedPct > 15 && `${simulation.autoRejectedPct.toFixed(0)}%`}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-medium pt-1">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="size-2.5 rounded-full bg-emerald-500" />
                  Auto-Verified ({simulation.autoVerifiedPct.toFixed(1)}%)
                </span>
                <span className="flex items-center gap-1.5 text-amber-400">
                  <span className="size-2.5 rounded-full bg-amber-500" />
                  Routed to Review ({simulation.reviewPct.toFixed(1)}%)
                </span>
                <span className="flex items-center gap-1.5 text-rose-400">
                  <span className="size-2.5 rounded-full bg-rose-500" />
                  Auto-Excluded ({simulation.autoRejectedPct.toFixed(1)}%)
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-400 space-y-1">
              <span className="font-semibold text-slate-200 block">Operational Assessment</span>
              <p className="leading-relaxed">
                At the current configuration ({minAge}–{maxAge}y, cutoff p{(percentileThreshold * 100).toFixed(0)}),{" "}
                an estimated <span className="text-amber-300 font-semibold">{simulation.reviewCount.toLocaleString()}</span> cases
                will require human clinician sign-off per {cohortSize.toLocaleString()} subject cohort,
                requiring roughly <span className="text-cyan-300 font-semibold">{simulation.clinicianHours.toFixed(1)} hours</span> of
                staffing bandwidth.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
