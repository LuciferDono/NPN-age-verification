import React from "react";
import { FairnessMatrix } from "../components/FairnessMatrix";
import { FAIRNESS_BENCHMARK } from "../lib/datasets";
import { ShieldCheck, Scale, AlertOctagon } from "lucide-react";

export const FairnessView: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="size-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100">
              Demographic Parity & Intersectional Fairness Audit
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Empirical evaluation of demographic bias across age, racial ancestry, and gender cohorts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            <ShieldCheck className="size-3.5" />
            Audited Against UTKFace
          </span>
        </div>
      </div>

      <FairnessMatrix data={FAIRNESS_BENCHMARK} />
    </div>
  );
};
