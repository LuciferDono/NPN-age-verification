import { useCallback, useEffect, useState } from "react";
import { ChartNoAxesColumn, ClipboardList, ScrollText, ScanFace } from "lucide-react";
import { api, type Meta } from "./api";
import { Audit, Queue, Verify } from "./views";
import { Evidence } from "./Evidence";
import { Dot } from "./ui";

type View = "verify" | "queue" | "audit" | "evidence";

const NAV: { id: View; label: string; icon: typeof ScanFace }[] = [
  { id: "verify", label: "Verify", icon: ScanFace },
  { id: "queue", label: "Review queue", icon: ClipboardList },
  { id: "audit", label: "Audit trail", icon: ScrollText },
  { id: "evidence", label: "Model evidence", icon: ChartNoAxesColumn },
];

export default function App() {
  const [view, setView] = useState<View>("verify");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [offline, setOffline] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    api
      .meta()
      .then((m) => {
        setMeta(m);
        setOffline(false);
      })
      .catch(() => setOffline(true));
  }, [tick]);

  const m = meta?.metrics;

  // Surfaced on every screen, not just the evidence view: a single MAE in the rail would
  // imply the model is equally good everywhere, and it is not.
  const weakest = (m?.per_band_mae ?? [])
    .filter((b) => b.mae !== null && b.band !== "geriatric_90plus")
    .sort((a, b) => (b.mae ?? 0) - (a.mae ?? 0))[0];

  return (
    <div className="flex min-h-dvh">
      {/* rail */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel">
        <div className="border-b border-line px-4 py-4">
          <h1 className="text-[13px] font-semibold leading-tight tracking-tight text-ink">
            Age Verification
          </h1>
          <p className="label mt-1">Clinical console</p>
        </div>

        <nav className="flex flex-col py-2">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`flex items-center gap-2.5 border-l-2 px-4 py-2 text-left text-xs transition-colors ${
                  active
                    ? "border-signal bg-raised text-ink"
                    : "border-transparent text-ink-dim hover:bg-raised/60 hover:text-ink"
                }`}
              >
                <Icon className="size-3.5 shrink-0" strokeWidth={1.5} />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3 border-t border-line px-4 py-3">
          <div>
            <div className="label mb-1.5">Held-out metrics</div>
            <dl className="space-y-1 font-mono text-[11px] tabular-nums">
              {[
                ["MAE", m?.mae, (v: number) => `${v.toFixed(2)} yr`],
                ["CS@5", m?.cs5, (v: number) => `${(v * 100).toFixed(0)}%`],
                ["Band acc.", m?.band_accuracy, (v: number) => `${(v * 100).toFixed(0)}%`],
                ["Baseline", m?.baseline_mae, (v: number) => `${v.toFixed(2)} yr`],
              ].map(([label, value, fmt]) => (
                <div key={label as string} className="flex justify-between">
                  <dt className="text-ink-faint">{label as string}</dt>
                  <dd className={value == null ? "text-ink-faint" : "text-ink-dim"}>
                    {value == null
                      ? "not measured"
                      : (fmt as (v: number) => string)(value as number)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {weakest && (
            <p className="border-t border-line pt-3 text-[10px] leading-relaxed text-ink-dim">
              Weakest band:{" "}
              <span className="font-mono text-stop">
                {weakest.band.replace(/_/g, " ")} {weakest.mae?.toFixed(1)} yr
              </span>
              . Accuracy is not uniform across ages.
            </p>
          )}

          <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
            {meta?.model.name ?? "—"} · {meta?.model.version ?? "—"}
            <br />
            contract 1.0.0
          </p>
        </div>
      </aside>

      {/* main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5">
          <span className="label">{NAV.find((n) => n.id === view)?.label}</span>

          <div className="flex items-center gap-4 font-mono text-[11px]">
            {meta?.mock && (
              <span className="flex items-center gap-1.5 border border-signal/60 px-2 py-0.5 text-signal">
                <Dot tone="signal" pulse />
                SYNTHETIC MODEL — NOT FOR CLINICAL USE
              </span>
            )}
            {meta?.public && !meta?.mock && (
              <span className="flex items-center gap-1.5 border border-stop/60 px-2 py-0.5 text-stop">
                <Dot tone="stop" />
                RESEARCH DEMO — DO NOT UPLOAD IMAGES OF OTHER PEOPLE
              </span>
            )}
            <span className="flex items-center gap-1.5 text-ink-faint">
              <Dot tone={offline ? "stop" : "ok"} />
              {offline ? "service unreachable" : "service online"}
            </span>
          </div>
        </header>

        <div className="min-w-0 flex-1 overflow-auto p-3">
          {view === "verify" && <Verify meta={meta} onChanged={refresh} />}
          {view === "queue" && <Queue onChanged={refresh} />}
          {view === "audit" && <Audit />}
          {view === "evidence" && <Evidence meta={meta} />}
        </div>
      </main>
    </div>
  );
}
