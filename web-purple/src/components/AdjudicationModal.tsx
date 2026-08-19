import React, { useState } from "react";
import type { QueueItem } from "../types/npn";
import { CheckCircle2, XCircle, Edit3, ShieldAlert, X, User } from "lucide-react";

interface AdjudicationModalProps {
  item: QueueItem | null;
  isOpen: boolean;
  onClose: () => void;
  onResolve: (
    requestId: string,
    reviewer: string,
    verdict: "accept" | "override" | "reject",
    overrideAge?: number,
    notes?: string
  ) => Promise<void>;
}

export const AdjudicationModal: React.FC<AdjudicationModalProps> = ({
  item,
  isOpen,
  onClose,
  onResolve,
}) => {
  const [reviewer, setReviewer] = useState("Dr. Vance (Senior Clinician)");
  const [verdict, setVerdict] = useState<"accept" | "override" | "reject">("accept");
  const [overrideAge, setOverrideAge] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewer.trim()) {
      setError("Reviewer clinician name is required.");
      return;
    }
    if (verdict === "override") {
      const parsed = parseFloat(overrideAge);
      if (isNaN(parsed) || parsed < 0 || parsed > 120) {
        setError("Please enter a valid override age between 0 and 120.");
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      await onResolve(
        item.request_id,
        reviewer.trim(),
        verdict,
        verdict === "override" ? parseFloat(overrideAge) : undefined,
        notes.trim()
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="size-5 text-amber-400" />
            <div>
              <h3 className="font-semibold text-slate-100">
                Clinical Adjudication Workbench
              </h3>
              <p className="font-mono text-[10px] text-slate-400">
                Request UUID: {item.request_id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Item Context Summary */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Model Age Estimate:</span>
              <span className="num-mono text-sm font-bold text-cyan-300">
                {item.age_estimate !== null ? `${item.age_estimate.toFixed(1)} yr` : "Indeterminate"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Confidence Percentile:</span>
              <span className="num-mono text-xs font-medium text-slate-300">
                {item.confidence_percentile !== null
                  ? `p${(item.confidence_percentile * 100).toFixed(0)} (${(item.confidence_percentile * 100).toFixed(1)}th percentile)`
                  : "—"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Target Clinical Band:</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                {item.band?.label || "Unassigned"}
              </span>
            </div>

            <div className="border-t border-slate-800/80 pt-2 text-xs">
              <span className="text-amber-400 font-medium block">Routing Trigger Rationale:</span>
              <p className="text-slate-300 mt-0.5">{item.reason}</p>
            </div>

            {item.image_sha256 && (
              <div className="pt-1 text-[10px] font-mono text-slate-500 truncate">
                SHA-256 Digest: {item.image_sha256}
              </div>
            )}
          </div>

          {/* Verdict Options */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
              Adjudication Decision
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setVerdict("accept")}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                  verdict === "accept"
                    ? "border-emerald-500 bg-emerald-950/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                    : "border-slate-800 bg-slate-950/40 text-slate-400 hover:bg-slate-800/40"
                }`}
              >
                <CheckCircle2 className="size-5" />
                <span className="text-xs font-bold">Accept Model</span>
                <span className="text-[10px] opacity-75">Confirm estimate</span>
              </button>

              <button
                type="button"
                onClick={() => setVerdict("override")}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                  verdict === "override"
                    ? "border-cyan-500 bg-cyan-950/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                    : "border-slate-800 bg-slate-950/40 text-slate-400 hover:bg-slate-800/40"
                }`}
              >
                <Edit3 className="size-5" />
                <span className="text-xs font-bold">Override Age</span>
                <span className="text-[10px] opacity-75">Enter confirmed age</span>
              </button>

              <button
                type="button"
                onClick={() => setVerdict("reject")}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                  verdict === "reject"
                    ? "border-rose-500 bg-rose-950/40 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
                    : "border-slate-800 bg-slate-950/40 text-slate-400 hover:bg-slate-800/40"
                }`}
              >
                <XCircle className="size-5" />
                <span className="text-xs font-bold">Reject Specimen</span>
                <span className="text-[10px] opacity-75">Require secondary</span>
              </button>
            </div>
          </div>

          {/* Conditional Override Age Input */}
          {verdict === "override" && (
            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label className="text-xs font-semibold text-slate-300 block">
                Validated Subject Age (Years)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="120"
                placeholder="e.g. 29.5"
                value={overrideAge}
                onChange={(e) => setOverrideAge(e.target.value)}
                required
                className="w-full rounded-lg border border-cyan-500/60 bg-slate-950 px-3.5 py-2 font-mono text-sm text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          )}

          {/* Clinician Attribution & Notes */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Adjudicating Clinician / Reviewer
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 size-4 text-slate-500" />
                <input
                  type="text"
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Clinical Rationale / Audit Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reference verified clinical document or clinical trial protocol justification..."
                className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-cyan-500 px-5 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/25 hover:bg-cyan-400 disabled:opacity-50"
            >
              {submitting ? "Signing Audit Record..." : "Confirm Adjudication"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
