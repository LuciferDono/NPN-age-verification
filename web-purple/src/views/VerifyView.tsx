import React, { useState, useRef } from "react";
import type { Meta, Prediction, QueueItem } from "../types/npn";
import { api, OUTCOME_COLORS } from "../lib/api";
import { BandLadder } from "../components/BandLadder";
import { DistributionPlot } from "../components/DistributionPlot";
import { CameraModal } from "../components/CameraModal";
import { AdjudicationModal } from "../components/AdjudicationModal";
import {
  Upload,
  Camera,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  HelpCircle,
  FileCheck,
  Fingerprint,
  ShieldCheck,
  ScanFace,
  FileText,
} from "lucide-react";

interface VerifyViewProps {
  meta: Meta | null;
  activePolicyId: string;
  onRefreshQueue: () => void;
}

export const VerifyView: React.FC<VerifyViewProps> = ({
  meta,
  activePolicyId,
  onRefreshQueue,
}) => {
  const [file, setFile] = useState<File | Blob | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Prediction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // Adjudication modal state
  const [adjudicateItem, setAdjudicateItem] = useState<QueueItem | null>(null);
  const [isAdjudicateOpen, setIsAdjudicateOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCustomFile = (selectedFile?: File | Blob, customName?: string) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    const resolvedName = customName || (selectedFile instanceof File ? selectedFile.name : "upload.jpg");
    setFileName(resolvedName);
    setFileSize(selectedFile.size);
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
    setResult(null);
    setError(null);
  };

  const handleCameraCapture = (blob: Blob, previewUrl: string) => {
    setFile(blob);
    setFileName("webcam_specimen.jpg");
    setFileSize(blob.size);
    setPreview(previewUrl);
    setResult(null);
    setError(null);
  };

  const executeAssessment = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const pred = await api.predict(file, activePolicyId, fileName);
      setResult(pred);
      onRefreshQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openAdjudication = () => {
    if (!result) return;
    const item: QueueItem = {
      request_id: result.request_id,
      age_estimate: result.age_estimate,
      confidence: result.confidence,
      confidence_percentile: result.confidence_percentile,
      band: result.band,
      reason: result.decision.reason,
      created_at: new Date().toISOString(),
      resolved: false,
      image_sha256: result.image_sha256,
    };
    setAdjudicateItem(item);
    setIsAdjudicateOpen(true);
  };

  const handleResolve = async (
    requestId: string,
    reviewer: string,
    verdict: "accept" | "override" | "reject",
    overrideAge?: number,
    notes?: string
  ) => {
    await api.resolveQueue(requestId, reviewer, verdict, overrideAge, notes);
    onRefreshQueue();
    if (result && result.request_id === requestId) {
      setResult({
        ...result,
        decision: {
          ...result.decision,
          outcome: verdict === "accept" || verdict === "override" ? "verified" : "rejected",
          reason: `Adjudicated by ${reviewer}: ${verdict.toUpperCase()}${
            overrideAge ? ` (Age overridden to ${overrideAge} yr)` : ""
          }`,
        },
        review_required: false,
      });
    }
  };

  const outcomeStyle = result ? OUTCOME_COLORS[result.decision.outcome] : null;

  return (
    <div className="space-y-5">
      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Input & Policy Panel */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Fingerprint className="size-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Subject Specimen
                </h3>
              </div>
              <button
                onClick={() => setIsCameraOpen(true)}
                className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <Camera className="size-3.5" />
                <span>Camera</span>
              </button>
            </div>

            {/* Dropzone & Preview Frame */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files?.[0]) {
                  handleCustomFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`group relative aspect-square w-full cursor-pointer overflow-hidden rounded-lg border border-dashed transition-colors flex flex-col items-center justify-center ${
                dragging
                  ? "border-cyan-400 bg-slate-800"
                  : "border-slate-700 bg-slate-950 hover:border-slate-500 hover:bg-slate-900"
              }`}
            >
              {preview ? (
                <>
                  <img
                    src={preview}
                    alt="Subject specimen"
                    className="h-full w-full object-cover"
                  />

                  {result?.status === "ok" && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                      <div className="relative h-4/5 w-4/5 rounded border border-cyan-400 bg-cyan-500/5">
                        <div className="absolute -top-2.5 left-2 rounded bg-slate-900 border border-slate-700 px-1.5 py-0.2 font-mono text-[9px] text-cyan-300">
                          FACE REGION
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-3 text-center">
                    <span className="text-xs text-slate-200">Click to change image</span>
                  </div>
                </>
              ) : (
                <div className="p-6 text-center space-y-2">
                  <div className="mx-auto flex size-10 items-center justify-center rounded bg-slate-900 border border-slate-800 text-slate-400">
                    <Upload className="size-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">
                      Drop facial specimen here
                    </span>
                    <span className="text-[11px] text-slate-500">
                      or click to browse local files
                    </span>
                  </div>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleCustomFile(e.target.files[0]);
                }
              }}
            />

            {/* Specimen Metadata Readout */}
            <div className="space-y-3">
              <div className="rounded border border-slate-800 bg-slate-950 p-2.5 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">File:</span>
                  <span className="font-mono text-slate-200 truncate max-w-[180px]">
                    {fileName || "No file selected"}
                  </span>
                </div>
                {fileSize > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Size:</span>
                    <span className="font-mono text-slate-300">
                      {(fileSize / 1024).toFixed(1)} KB
                    </span>
                  </div>
                )}
                {result?.image_sha256 && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-[10px]">
                    <span className="text-slate-500">Digest:</span>
                    <span
                      className="font-mono text-emerald-400 truncate max-w-[170px]"
                      title={result.image_sha256}
                    >
                      {result.image_sha256.slice(0, 16)}...
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={executeAssessment}
                disabled={!file || busy}
                className="flex w-full items-center justify-center gap-2 rounded bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-40 transition-colors"
              >
                {busy ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    <span>Evaluating Specimen...</span>
                  </>
                ) : (
                  <>
                    <ScanFace className="size-4" />
                    <span>Run Verification</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Active Policy Summary Panel */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2 text-xs">
            <h4 className="font-bold uppercase tracking-wider text-slate-300 text-[11px]">
              Active Clinical Protocol
            </h4>
            <div className="space-y-1.5 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Policy:</span>
                <span className="font-medium text-slate-200">{meta?.policy.label || "Trial Eligibility"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Eligibility Range:</span>
                <span className="font-mono text-slate-200">
                  {meta?.policy.min_age ?? 18} – {meta?.policy.max_age ?? 64} yr
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Review Floor:</span>
                <span className="font-mono text-amber-400">
                  Bottom {meta ? (meta.review_percentile * 100).toFixed(0) : 15}% (&le; p15)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Boundary Rule:</span>
                <span className="text-slate-300">Mandatory on interval crossing</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Results & Clinical Ladder */}
        <div className="lg:col-span-8 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-4 text-xs text-rose-300 flex items-start gap-3">
              <AlertTriangle className="size-5 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Inference Error</span>
                <p className="text-rose-200/90">{error}</p>
              </div>
            </div>
          )}

          {result ? (
            <div className="space-y-4">
              {/* Primary Assessment Summary Card */}
              <div
                className={`rounded-xl border p-5 ${
                  outcomeStyle?.bg || "bg-slate-900"
                } ${outcomeStyle?.border || "border-slate-800"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex size-10 items-center justify-center rounded-lg border ${
                        outcomeStyle?.badge || "bg-slate-800"
                      }`}
                    >
                      {result.decision.outcome === "verified" && (
                        <CheckCircle2 className="size-5 text-emerald-400" />
                      )}
                      {result.decision.outcome === "review" && (
                        <ShieldAlert className="size-5 text-amber-400" />
                      )}
                      {result.decision.outcome === "rejected" && (
                        <AlertTriangle className="size-5 text-rose-400" />
                      )}
                      {result.decision.outcome === "indeterminate" && (
                        <HelpCircle className="size-5 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Assessment Decision
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 font-mono text-xs font-bold uppercase border ${
                            outcomeStyle?.badge || ""
                          }`}
                        >
                          {result.decision.outcome}
                        </span>
                      </div>
                      <h2 className="text-base font-bold text-slate-100 mt-0.5">
                        {result.decision.reason}
                      </h2>
                    </div>
                  </div>

                  {result.review_required && (
                    <button
                      onClick={openAdjudication}
                      className="flex items-center gap-2 rounded bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors"
                    >
                      <ShieldCheck className="size-4" />
                      <span>Adjudicate Case</span>
                    </button>
                  )}
                </div>

                {/* Metrics Table / Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/80">
                  <div className="rounded bg-slate-950 p-3 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Age Estimate
                    </span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="num-mono text-2xl font-bold text-cyan-400">
                        {result.age_estimate !== null ? result.age_estimate.toFixed(1) : "—"}
                      </span>
                      <span className="text-xs text-slate-400">yr</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {result.band ? result.band.label : "—"}
                    </span>
                  </div>

                  <div className="rounded bg-slate-950 p-3 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      80% Credible Range
                    </span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="num-mono text-lg font-bold text-slate-200">
                        {result.age_interval
                          ? `[${result.age_interval[0].toFixed(1)}, ${result.age_interval[1].toFixed(1)}]`
                          : "—"}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {result.age_interval
                        ? `±${((result.age_interval[1] - result.age_interval[0]) / 2).toFixed(1)} yr spread`
                        : "—"}
                    </span>
                  </div>

                  <div className="rounded bg-slate-950 p-3 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Confidence Score
                    </span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span
                        className={`num-mono text-2xl font-bold ${
                          result.confidence_percentile && result.confidence_percentile <= 0.15
                            ? "text-amber-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {result.confidence_percentile !== null
                          ? `p${(result.confidence_percentile * 100).toFixed(0)}`
                          : "—"}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Validation Percentile
                    </span>
                  </div>

                  <div className="rounded bg-slate-950 p-3 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Inference Latency
                    </span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="num-mono text-2xl font-bold text-slate-200">
                        {result.latency_ms.toFixed(1)}
                      </span>
                      <span className="text-xs text-slate-400">ms</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Contract {result.contract}
                    </span>
                  </div>
                </div>
              </div>

              {/* Band Ladder Visualizer */}
              {meta?.bands && (
                <BandLadder
                  bands={meta.bands}
                  estimate={result.age_estimate}
                  interval={result.age_interval}
                />
              )}

              {/* Soft Probability Distribution Plot */}
              <DistributionPlot
                probabilities={result.probabilities}
                estimate={result.age_estimate}
                interval={result.age_interval}
                policyMin={meta?.policy.min_age ?? 18}
                policyMax={meta?.policy.max_age ?? 64}
              />

              {/* Rule Verification Audit Trace */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileCheck className="size-4 text-cyan-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Rule Execution Diagnostic Trace
                    </h4>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">
                    Rule: {result.decision.rule}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="rounded bg-slate-950 p-2.5 border border-slate-800">
                    <span className="text-slate-500 text-[10px] block">Confidence Floor (p &gt; 0.15)</span>
                    <div className="font-mono font-semibold mt-0.5">
                      {result.confidence_percentile !== null && result.confidence_percentile <= 0.15 ? (
                        <span className="text-amber-400">TRIGGERED (p &le; 0.15)</span>
                      ) : (
                        <span className="text-emerald-400">PASSED</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded bg-slate-950 p-2.5 border border-slate-800">
                    <span className="text-slate-500 text-[10px] block">Boundary Straddle Check</span>
                    <div className="font-mono font-semibold mt-0.5">
                      {result.decision.rule === "interval_straddles_band_boundary" ? (
                        <span className="text-amber-400">TRIGGERED (Spans Boundary)</span>
                      ) : (
                        <span className="text-emerald-400">PASSED (Decisive Band)</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded bg-slate-950 p-2.5 border border-slate-800">
                    <span className="text-slate-500 text-[10px] block">Policy Bracket Match</span>
                    <div className="font-mono font-semibold mt-0.5">
                      {result.decision.outcome === "verified" ? (
                        <span className="text-emerald-400">ELIGIBLE ({meta?.policy.min_age}–{meta?.policy.max_age}y)</span>
                      ) : result.decision.outcome === "rejected" ? (
                        <span className="text-rose-400">OUTSIDE POLICY RANGE</span>
                      ) : (
                        <span className="text-slate-400">ROUTED TO REVIEW</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-80 flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
                <ScanFace className="size-6" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-200">
                Ready for Specimen Assessment
              </h3>
              <p className="mt-1 max-w-sm text-xs text-slate-400">
                Upload a facial image or capture via webcam to run confidence-gated age verification.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Camera Capture Modal */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
      />

      {/* Adjudication Workbench Modal */}
      <AdjudicationModal
        item={adjudicateItem}
        isOpen={isAdjudicateOpen}
        onClose={() => setIsAdjudicateOpen(false)}
        onResolve={handleResolve}
      />
    </div>
  );
};
