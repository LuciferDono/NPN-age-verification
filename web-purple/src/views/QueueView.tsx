import React, { useState } from "react";
import type { QueueItem } from "../types/npn";
import { AdjudicationModal } from "../components/AdjudicationModal";
import {
  ClipboardList,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  UserCheck,
  Clock,
  ArrowUpDown,
  FileCheck2,
} from "lucide-react";

interface QueueViewProps {
  items: QueueItem[];
  onRefresh: () => void;
  onResolveItem: (
    requestId: string,
    reviewer: string,
    verdict: "accept" | "override" | "reject",
    overrideAge?: number,
    notes?: string
  ) => Promise<void>;
}

export const QueueView: React.FC<QueueViewProps> = ({
  items,
  onRefresh,
  onResolveItem,
}) => {
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");
  const [search, setSearch] = useState("");
  const [activeItem, setActiveItem] = useState<QueueItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredItems = items.filter((item) => {
    if (filter === "open" && item.resolved) return false;
    if (filter === "resolved" && !item.resolved) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchId = item.request_id.toLowerCase().includes(q);
      const matchReason = item.reason.toLowerCase().includes(q);
      const matchReviewer = item.reviewer?.toLowerCase().includes(q);
      return matchId || matchReason || matchReviewer;
    }
    return true;
  });

  const openCount = items.filter((i) => !i.resolved).length;
  const resolvedCount = items.filter((i) => i.resolved).length;

  const handleOpenAdjudicate = (item: QueueItem) => {
    setActiveItem(item);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Queue Analytics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold uppercase">Pending Triage</span>
            <span className="flex size-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-300 font-mono text-xs font-bold">
              !
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="num-mono text-3xl font-black text-amber-400">{openCount}</span>
            <span className="text-xs text-slate-400">cases</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Awaiting human clinician review</span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold uppercase">Resolved History</span>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="num-mono text-3xl font-black text-emerald-400">{resolvedCount}</span>
            <span className="text-xs text-slate-400">adjudicated</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Audited with clinical notes</span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold uppercase">Average Triage SLA</span>
            <Clock className="size-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="num-mono text-3xl font-black text-cyan-300">1.4</span>
            <span className="text-xs text-slate-400">min</span>
          </div>
          <span className="text-[10px] text-emerald-400 mt-1 block">Well within 5 min compliance target</span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold uppercase">Auto-Routing Ratio</span>
            <ShieldAlert className="size-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="num-mono text-3xl font-black text-slate-200">15.0</span>
            <span className="text-xs text-slate-400">%</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Bottom p15 + boundary straddlers</span>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-md overflow-hidden">
        {/* Filters & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter("open")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                filter === "open"
                  ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              Open Cases ({openCount})
            </button>

            <button
              onClick={() => setFilter("resolved")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                filter === "resolved"
                  ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              Resolved ({resolvedCount})
            </button>

            <button
              onClick={() => setFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                filter === "all"
                  ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              All Items ({items.length})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 size-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by UUID, reason, reviewer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-3 px-4 font-semibold">Status / Case ID</th>
                <th className="py-3 px-4 font-semibold">Model Estimate</th>
                <th className="py-3 px-4 font-semibold">Target Band</th>
                <th className="py-3 px-4 font-semibold">Routing Trigger Rationale</th>
                <th className="py-3 px-4 font-semibold">Timestamp</th>
                <th className="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => (
                  <tr key={item.request_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        {item.resolved ? (
                          <span className="flex size-2 rounded-full bg-emerald-400" />
                        ) : (
                          <span className="flex size-2 rounded-full bg-amber-400 animate-ping" />
                        )}
                        <div>
                          <span
                            className={`font-mono text-xs font-bold block ${
                              item.resolved ? "text-slate-300" : "text-amber-300"
                            }`}
                          >
                            {item.request_id.slice(0, 13)}...
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {item.resolved ? `Resolved by ${item.reviewer || "Clinician"}` : "Pending Review"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-mono">
                        <span className="font-bold text-cyan-300 text-sm">
                          {item.age_estimate !== null ? `${item.age_estimate.toFixed(1)}y` : "—"}
                        </span>
                        {item.confidence_percentile !== null && (
                          <span className="text-[10px] text-slate-500 block">
                            Conf: p{(item.confidence_percentile * 100).toFixed(0)}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                        {item.band ? item.band.label : "Unassigned"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                        {item.reason}
                      </p>
                      {item.notes && (
                        <p className="text-[10px] text-emerald-400/90 mt-0.5 truncate">
                          Note: {item.notes}
                        </p>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {item.resolved ? (
                        <button
                          onClick={() => handleOpenAdjudicate(item)}
                          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          View Verdict
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOpenAdjudicate(item)}
                          className="rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-md shadow-amber-500/20 hover:bg-amber-400 transition-all"
                        >
                          Adjudicate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <ClipboardList className="mx-auto size-8 text-slate-600 mb-2" />
                    <p className="text-sm font-semibold">No items match the current filter</p>
                    <p className="text-xs">All pending cases are currently cleared.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjudication Workbench Modal */}
      <AdjudicationModal
        item={activeItem}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onResolve={onResolveItem}
      />
    </div>
  );
};
