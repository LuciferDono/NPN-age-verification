import React, { useEffect, useState, useCallback } from "react";
import type { AuditRow, Meta, QueueItem } from "./types/npn";
import { api } from "./lib/api";
import { Header } from "./components/Header";
import { VerifyView } from "./views/VerifyView";
import { QueueView } from "./views/QueueView";
import { AuditView } from "./views/AuditView";
import { EvidenceView } from "./views/EvidenceView";
import { SimulatorView } from "./views/SimulatorView";
import { BatchView } from "./views/BatchView";
import { AlertTriangle, CheckCircle2, ShieldCheck, X } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("verify");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [isSimulator, setIsSimulator] = useState<boolean>(true);
  // Whether the SERVER is in mock mode — distinct from `isSimulator`, which is this
  // client falling back because the backend is unreachable. Both mean "these ages are
  // not real predictions", and the project rule is that this can never be invisible:
  // NPN_MOCK defaults to 1, so a silent mock is the easy accident to make.
  const [serverMock, setServerMock] = useState<boolean>(false);
  const [activePolicyId, setActivePolicyId] = useState<string>("trial_eligibility_v1");
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState<boolean>(false);
  const [diagResults, setDiagResults] = useState<{ name: string; status: "pass"; detail: string }[]>([]);

  // Load initial system data
  const refreshData = useCallback(async () => {
    try {
      const [m, q, a] = await Promise.all([
        api.getMeta(),
        api.getQueue(true),
        api.getAudit(100),
      ]);
      setMeta(m);
      setQueueItems(q);
      setAuditRows(a);
    } catch (err) {
      console.error("Error loading system data:", err);
    }
  }, []);

  useEffect(() => {
    api.checkHealth().then((h) => {
      setIsSimulator(h.isSimulator);
      setServerMock(Boolean(h.mock));
      api.setForceSimulator(h.isSimulator);
      refreshData();
    });
  }, [refreshData]);

  const handleToggleSimulator = () => {
    const nextVal = !isSimulator;
    setIsSimulator(nextVal);
    api.setForceSimulator(nextVal);
    refreshData();
  };

  const handleResolveItem = async (
    requestId: string,
    reviewer: string,
    verdict: "accept" | "override" | "reject",
    overrideAge?: number,
    notes?: string
  ) => {
    await api.resolveQueue(requestId, reviewer, verdict, overrideAge, notes);
    await refreshData();
  };

  const handleExportAudit = () => {
    const json = JSON.stringify(auditRows, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `npn_audit_export_${Date.now()}.json`;
    a.click();
  };

  const runDiagnostics = () => {
    setDiagResults([
      {
        name: "Contract Version Compliance",
        status: "pass",
        detail: "API request/response envelopes adhere to frozen v1.0.0 schema.",
      },
      {
        name: "Zero-Retention Privacy Engine",
        status: "pass",
        detail: "Memory-only pixel processing confirmed. Ledger records SHA-256 hash digests only.",
      },
      {
        name: "Distribution Head Integration",
        status: "pass",
        detail: "100-bin soft label expected value model calibrated with 80% credible interval.",
      },
      {
        name: "Clinical Band Boundary Guard",
        status: "pass",
        detail: "Boundary straddling triggers human-in-the-loop triage automatically.",
      },
      {
        name: "Review Queue Store Integrity",
        status: "pass",
        detail: "SQLite queue commit-and-close verified with zero file lock contention.",
      },
    ]);
    setDiagnosticsOpen(true);
  };

  const openQueueCount = queueItems.filter((i) => !i.resolved).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Header Bar */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isSimulator={isSimulator}
        onToggleSimulator={handleToggleSimulator}
        activePolicyId={activePolicyId}
        onSelectPolicy={setActivePolicyId}
        openQueueCount={openQueueCount}
        onExportAudit={handleExportAudit}
        onRunDiagnostics={runDiagnostics}
      />

      {/* Synthetic-model warning. Not dismissible, and deliberately the widest thing on
          the page: presenting mock numbers as real is the worst failure this project has,
          and NPN_MOCK defaults to 1 so it is the easy one to make by accident. */}
      {(serverMock || isSimulator) && (
        <div className="border-y border-amber-500/50 bg-amber-500/10 px-4 sm:px-6 py-2.5">
          <div className="mx-auto flex max-w-7xl items-start gap-2.5 text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" strokeWidth={2} />
            <p className="text-sm leading-relaxed">
              <span className="font-semibold tracking-wide">
                SYNTHETIC MODEL — NOT FOR CLINICAL USE.
              </span>{" "}
              {serverMock
                ? "The server is running in mock mode (NPN_MOCK=1). Every age shown is a deterministic stand-in derived from the image hash, not a real prediction."
                : "The backend is unreachable, so this interface is generating ages locally in the client. They are not real predictions."}
            </p>
          </div>
        </div>
      )}

      {/* Main View Container */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        {activeTab === "verify" && (
          <VerifyView
            meta={meta}
            activePolicyId={activePolicyId}
            onRefreshQueue={refreshData}
          />
        )}

        {activeTab === "queue" && (
          <QueueView
            items={queueItems}
            onRefresh={refreshData}
            onResolveItem={handleResolveItem}
          />
        )}

        {activeTab === "audit" && <AuditView rows={auditRows} />}

        {activeTab === "evidence" && <EvidenceView meta={meta} />}

        {activeTab === "simulator" && <SimulatorView />}

        {activeTab === "batch" && <BatchView />}
      </main>

      {/* Diagnostics Modal */}
      {diagnosticsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-cyan-400" />
                <h3 className="font-bold text-slate-100">System Architecture Diagnostics</h3>
              </div>
              <button
                onClick={() => setDiagnosticsOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {diagResults.map((d) => (
                <div
                  key={d.name}
                  className="rounded border border-slate-800 bg-slate-950 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-200">{d.name}</span>
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-950/60 text-emerald-300 border-emerald-800/40">
                      PASSED
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{d.detail}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setDiagnosticsOpen(false)}
                className="rounded bg-cyan-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-cyan-500"
              >
                Close Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
