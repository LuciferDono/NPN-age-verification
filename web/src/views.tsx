import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ScanFace, Upload } from "lucide-react";
import {
  api,
  outcomeTone,
  statusLabel,
  type AuditRow,
  type Meta,
  type Prediction,
  type QueueItem,
} from "./api";
import { BandLadder, ConfidenceScale } from "./BandLadder";
import { Btn, Dot, Empty, Field, Id, Panel, Td, Th, toneText } from "./ui";

/* ------------------------------------------------------------------ verify */

export function Verify({ meta, onChanged }: { meta: Meta | null; onChanged: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Prediction | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke the previous object URL on change — an unbounded leak otherwise, and this
  // screen gets hammered during a demo.
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      setResult(await api.predict(file, meta?.policy.id));
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [file, meta, onChanged]);

  const accept = (f: File | undefined) => {
    if (!f) return;
    setResult(null);
    setErr(null);
    setFile(f);
  };

  const ok = result?.status === "ok";
  const tone = result ? outcomeTone[result.decision.outcome] : "dim";

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(280px,340px)_1fr]">
      <div className="flex flex-col gap-3">
        <Panel title="Subject image">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              accept(e.dataTransfer.files[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`grid aspect-square cursor-pointer place-items-center border border-dashed transition-colors ${
              dragging ? "border-signal bg-signal/5" : "border-line-strong hover:border-ink-faint"
            }`}
          >
            {preview ? (
              <img src={preview} alt="subject" className="size-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-ink-faint">
                <Upload className="size-4" strokeWidth={1.5} />
                <span className="label">drop image or click</span>
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => accept(e.target.files?.[0])}
          />

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[11px] text-ink-faint">
              {file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : "no file selected"}
            </span>
            <Btn onClick={submit} disabled={!file || busy} variant="primary">
              {busy ? "analysing" : "analyse"}
            </Btn>
          </div>
        </Panel>

        <Panel title="Active policy">
          <div className="space-y-3">
            <Field label="Policy" value={meta?.policy.label ?? "—"} mono={false} />
            <Field
              label="Eligible range"
              value={meta ? `${meta.policy.min_age} – ${meta.policy.max_age}` : "—"}
            />
            <Field
              label="Review threshold"
              value={meta ? `p${(meta.review_percentile * 100).toFixed(0)} and below` : "—"}
              tone="signal"
            />
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        {err && (
          <div className="flex items-start gap-2 border border-stop/50 bg-stop/5 px-3 py-2 text-xs text-stop">
            <AlertTriangle className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
            <span className="font-mono">{err}</span>
          </div>
        )}

        {!result && !err && (
          <Panel className="grid min-h-64 place-items-center">
            <div className="flex flex-col items-center gap-2 text-ink-faint">
              <ScanFace className="size-5" strokeWidth={1.25} />
              <span className="label">awaiting subject image</span>
            </div>
          </Panel>
        )}

        {result && (
          <>
            <Panel
              title="Assessment"
              aside={
                <span className="flex items-center gap-1.5 font-mono text-[11px]">
                  <Dot tone={tone} />
                  <span className={toneText[tone]}>{result.decision.outcome.toUpperCase()}</span>
                </span>
              }
              className="rise"
            >
              {ok ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Field
                      label="Estimated age"
                      value={result.age_estimate!.toFixed(1)}
                      size="lg"
                    />
                    <Field
                      label="80% interval"
                      value={`${result.age_interval![0].toFixed(1)}–${result.age_interval![1].toFixed(1)}`}
                    />
                    <Field label="Band" value={result.band!.label} mono={false} />
                    <Field
                      label="Latency"
                      value={`${result.latency_ms < 1 ? "<1" : result.latency_ms} ms`}
                    />
                  </div>

                  <BandLadder
                    bands={meta?.bands ?? []}
                    age={result.age_estimate}
                    interval={result.age_interval}
                    straddled={result.decision.rule === "interval_straddles_band_boundary"}
                  />
                </div>
              ) : (
                <div className="flex items-start gap-2 py-6">
                  <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${toneText.signal}`} strokeWidth={1.5} />
                  <div>
                    <p className="text-sm text-ink">{statusLabel[result.status]}</p>
                    <p className="mt-1 font-mono text-[11px] text-ink-faint">
                      {result.quality_reason ?? result.error ?? "No usable prediction for this image."}
                    </p>
                    <p className="mt-2 text-[11px] text-ink-dim">
                      Submit a single, front-facing subject image. This case is logged and routed
                      to review rather than silently discarded.
                    </p>
                  </div>
                </div>
              )}
            </Panel>

            <div className="grid gap-3 sm:grid-cols-2">
              <Panel title="Decision basis" className="rise" >
                <div className="space-y-3">
                  <Field label="Outcome" value={result.decision.outcome} tone={tone} />
                  <div>
                    <div className="label mb-1.5">Reason</div>
                    <p className="text-xs leading-relaxed text-ink-dim">{result.decision.reason}</p>
                  </div>
                  <Field label="Rule fired" value={result.decision.rule} />
                </div>
              </Panel>

              <Panel title="Model certainty" className="rise">
                <ConfidenceScale
                  percentile={result.confidence_percentile}
                  threshold={meta?.review_percentile ?? 0.15}
                  confidence={result.confidence}
                />
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Field label="Model" value={result.model.name} />
                  <Field label="Head" value={result.model.head} />
                </div>
              </Panel>
            </div>

            <div className="flex items-center justify-between border border-line bg-panel px-3 py-2">
              <span className="label">Audit reference</span>
              <span className="font-mono text-[11px] text-ink-faint">{result.request_id}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- queue */

export function Queue({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [sel, setSel] = useState<QueueItem | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [overrideAge, setOverrideAge] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.queue().then((r) => setItems(r.items)).catch((e) => setErr(String(e)));
  }, []);
  useEffect(load, [load]);

  const act = async (verdict: "accept" | "override") => {
    if (!sel) return;
    setErr(null);
    try {
      await api.resolve(
        sel.request_id,
        reviewer.trim() || "unattributed",
        verdict,
        verdict === "override" ? Number(overrideAge) : undefined,
      );
      setSel(null);
      setOverrideAge("");
      load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const overrideValid = overrideAge !== "" && Number.isFinite(Number(overrideAge));

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_minmax(260px,320px)]">
      <Panel title="Open review queue" aside={<span className="label">{items.length} open</span>}>
        {items.length === 0 ? (
          <Empty>
            No cases awaiting review. Predictions below the confidence threshold, or whose
            interval crosses a band boundary, appear here automatically.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th w="14%">Request</Th>
                  <Th align="right" w="10%">Age</Th>
                  <Th align="right" w="10%">Pctl</Th>
                  <Th w="20%">Band</Th>
                  <Th>Routing rule</Th>
                  <Th w="17%">Received</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const active = sel?.request_id === i.request_id;
                  return (
                    <tr
                      key={i.request_id}
                      onClick={() => setSel(i)}
                      className={`cursor-pointer transition-colors ${
                        active ? "bg-signal/10" : "hover:bg-raised"
                      }`}
                    >
                      <Td><Id value={i.request_id} /></Td>
                      <Td align="right" tone={active ? "signal" : undefined}>
                        {i.age_estimate?.toFixed(1) ?? "—"}
                      </Td>
                      <Td align="right" tone="signal">
                        {i.confidence_percentile === null
                          ? "—"
                          : `p${(i.confidence_percentile * 100).toFixed(0)}`}
                      </Td>
                      <Td mono={false}>{i.band?.label ?? "unbanded"}</Td>
                      <Td>{i.reason}</Td>
                      <Td>{i.created_at.replace("T", " ").replace("Z", "")}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Reviewer action">
        {!sel ? (
          <Empty>Select a case to adjudicate.</Empty>
        ) : (
          <div className="space-y-4">
            <Field label="Case" value={sel.request_id.slice(0, 18) + "…"} />
            <Field label="Model estimate" value={sel.age_estimate?.toFixed(1) ?? "—"} size="lg" />
            <Field label="Routed because" value={sel.reason} />

            <label className="block">
              <span className="label">Reviewer</span>
              <input
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                placeholder="clinician id"
                className="mt-1.5 w-full border border-line bg-raised px-2 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-signal focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="label">Override age</span>
              <input
                value={overrideAge}
                onChange={(e) => setOverrideAge(e.target.value)}
                inputMode="decimal"
                placeholder="only if overriding"
                className="mt-1.5 w-full border border-line bg-raised px-2 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-signal focus:outline-none"
              />
            </label>

            {err && <p className="font-mono text-[11px] text-stop">{err}</p>}

            <div className="flex gap-2">
              <Btn onClick={() => act("accept")}>Accept estimate</Btn>
              <Btn onClick={() => act("override")} disabled={!overrideValid} variant="primary">
                Override
              </Btn>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              Both actions are written to the audit trail against the reviewer id. Resolving a
              case does not alter the original model output.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------- audit */

export function Audit() {
  const [rows, setRows] = useState<AuditRow[]>([]);

  useEffect(() => {
    api.audit(200).then((r) => setRows(r.items)).catch(() => setRows([]));
  }, []);

  return (
    <Panel
      title="Audit trail"
      aside={<span className="label">{rows.length} events · images not retained</span>}
    >
      {rows.length === 0 ? (
        <Empty>No events recorded yet.</Empty>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-panel">
              <tr>
                <Th w="6%">#</Th>
                <Th w="12%">Request</Th>
                <Th w="12%">Event</Th>
                <Th w="12%">Actor</Th>
                <Th>Detail</Th>
                <Th w="12%">Image SHA-256</Th>
                <Th w="16%">Timestamp</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-raised">
                  <Td>{r.id}</Td>
                  <Td><Id value={r.request_id} /></Td>
                  <Td tone={r.event === "predict_error" ? "stop" : r.event === "review_resolved" ? "signal" : undefined}>
                    {r.event}
                  </Td>
                  <Td>{r.actor}</Td>
                  <Td>{r.detail}</Td>
                  <Td>{r.image_sha256 ? <Id value={r.image_sha256} head={10} /> : "—"}</Td>
                  <Td>{r.created_at.replace("T", " ").replace("Z", "")}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
