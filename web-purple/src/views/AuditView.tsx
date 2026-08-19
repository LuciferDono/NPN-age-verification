import React, { useState } from "react";
import type { AuditRow } from "../types/npn";
import {
  ScrollText,
  Search,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Lock,
  Copy,
  Check,
} from "lucide-react";

interface AuditViewProps {
  rows: AuditRow[];
}

export const AuditView: React.FC<AuditViewProps> = ({ rows }) => {
  const [search, setSearch] = useState("");
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.request_id.toLowerCase().includes(q) ||
      r.event.toLowerCase().includes(q) ||
      r.detail.toLowerCase().includes(q) ||
      r.actor.toLowerCase().includes(q) ||
      (r.image_sha256 && r.image_sha256.toLowerCase().includes(q))
    );
  });

  const handleCopy = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const exportCSV = () => {
    const headers = ["ID", "Request ID", "Event", "Actor", "Detail", "Image SHA-256", "Timestamp"];
    const lines = filtered.map((r) => [
      r.id,
      `"${r.request_id}"`,
      `"${r.event}"`,
      `"${r.actor}"`,
      `"${r.detail.replace(/"/g, '""')}"`,
      `"${r.image_sha256 || ""}"`,
      `"${r.created_at}"`,
    ]);
    const csvContent = [headers.join(","), ...lines.map((l) => l.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `npn_compliance_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `npn_compliance_audit_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Cryptographic Proof Banner */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-400">
              <Lock className="size-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Zero-Retention Cryptographic Privacy Guarantee
              </h3>
              <p className="text-xs text-slate-300">
                Raw image pixels are discarded immediately in memory. Only one-way SHA-256 digests
                are committed to the SQLite ledger to guarantee strict HIPAA / GDPR biometric compliance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <FileSpreadsheet className="size-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={exportJSON}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Download className="size-3.5 text-cyan-400" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* Ledger Container */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-md overflow-hidden">
        {/* Search Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 p-4 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <ScrollText className="size-4 text-cyan-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Immutable System & Clinician Event Stream
            </h4>
            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
              {filtered.length} Recorded Events
            </span>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 size-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by hash, UUID, action, clinician..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-3 px-4 font-semibold">Timestamp (UTC)</th>
                <th className="py-3 px-4 font-semibold">Event / Action</th>
                <th className="py-3 px-4 font-semibold">Actor</th>
                <th className="py-3 px-4 font-semibold">Event Parameters / Clinical Rationale</th>
                <th className="py-3 px-4 font-semibold">Specimen SHA-256 Digest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length > 0 ? (
                filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold border ${
                          row.event === "predict"
                            ? "bg-cyan-950/60 text-cyan-300 border-cyan-800/40"
                            : row.event === "review_resolved"
                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/40"
                            : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        {row.event}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-medium text-slate-300 whitespace-nowrap">
                      {row.actor}
                    </td>

                    <td className="py-3 px-4 max-w-sm text-slate-300">
                      <p className="line-clamp-2 leading-relaxed">{row.detail}</p>
                      <span className="font-mono text-[10px] text-slate-500 truncate block mt-0.5">
                        UUID: {row.request_id}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      {row.image_sha256 ? (
                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-400/90">
                          <span title={row.image_sha256}>
                            {row.image_sha256.slice(0, 16)}...
                          </span>
                          <button
                            onClick={() => handleCopy(row.image_sha256!)}
                            className="rounded p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                            title="Copy full 64-char SHA-256 hash"
                          >
                            {copiedHash === row.image_sha256 ? (
                              <Check className="size-3 text-emerald-400" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono text-[10px] text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    No matching audit rows found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
