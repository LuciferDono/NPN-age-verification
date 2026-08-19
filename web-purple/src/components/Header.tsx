import React from "react";
import {
  Activity,
  ShieldCheck,
  Zap,
  Server,
  Download,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import { POLICIES } from "../lib/simulator";

interface HeaderProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  isSimulator: boolean;
  onToggleSimulator: () => void;
  activePolicyId: string;
  onSelectPolicy: (policyId: string) => void;
  openQueueCount: number;
  onExportAudit: () => void;
  onRunDiagnostics: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  isSimulator,
  onToggleSimulator,
  activePolicyId,
  onSelectPolicy,
  openQueueCount,
  onExportAudit,
  onRunDiagnostics,
}) => {
  const tabs = [
    { id: "verify", label: "Biometric Assessment", count: null },
    { id: "queue", label: "Review Queue", count: openQueueCount },
    { id: "audit", label: "Audit Ledger", count: null },
    { id: "evidence", label: "Model Metrics & Calibration", count: null },
    { id: "simulator", label: "Policy Simulator", count: null },
    { id: "batch", label: "Batch Evaluation", count: null },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md">
      {/* Top Status & System Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 px-6 py-2.5">
        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-600 text-slate-950 font-bold">
            <Activity className="size-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-slate-100">
                NPN Clinical Age Verification
              </h1>
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-400 border border-slate-700">
                Console v1.0.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Confidence-Gated Decision Path & Audit Architecture
            </p>
          </div>
        </div>

        {/* System Telemetry & Mode Controls */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {/* HIPAA Digest Badge */}
          <div className="flex items-center gap-1.5 rounded border border-slate-800 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-300">
            <ShieldCheck className="size-3.5 text-emerald-400" />
            <span className="font-mono text-emerald-400">SHA-256</span>
            <span className="text-slate-400">Zero Retention</span>
          </div>

          {/* Active Policy Selector */}
          <div className="flex items-center gap-1.5 rounded border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-300">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Policy:</span>
            <select
              value={activePolicyId}
              onChange={(e) => onSelectPolicy(e.target.value)}
              className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer text-xs"
            >
              {Object.values(POLICIES).map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                  {p.label} ({p.min_age}–{p.max_age} yr)
                </option>
              ))}
            </select>
          </div>

          {/* Engine Backend Switcher */}
          <button
            onClick={onToggleSimulator}
            className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
          >
            {isSimulator ? (
              <>
                <Zap className="size-3.5 text-cyan-400" />
                <span>Deterministic Client Engine</span>
              </>
            ) : (
              <>
                <Server className="size-3.5 text-emerald-400" />
                <span>Backend Server (:8000)</span>
              </>
            )}
          </button>

          {/* Quick Diagnostics */}
          <button
            onClick={onRunDiagnostics}
            className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <CheckCircle2 className="size-3.5 text-slate-400" />
            <span>Diagnostics</span>
          </button>

          {/* Export */}
          <button
            onClick={onExportAudit}
            className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <Download className="size-3.5 text-slate-400" />
            <span>Export Audit</span>
          </button>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center justify-between px-6">
        <nav className="flex items-center gap-1 overflow-x-auto py-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`relative flex items-center gap-2 px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap rounded ${
                  isActive
                    ? "bg-slate-800 text-white border-b-2 border-cyan-400"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== null && tab.count > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-950">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
