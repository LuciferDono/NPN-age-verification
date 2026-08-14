import type { ReactNode } from "react";

/** Instrument primitives. Hairline rules and flat planes — no cards, no shadows. */

export type Tone = "ok" | "signal" | "stop" | "dim";

export const toneText: Record<Tone, string> = {
  ok: "text-ok",
  signal: "text-signal",
  stop: "text-stop",
  dim: "text-ink-faint",
};

export const toneBg: Record<Tone, string> = {
  ok: "bg-ok",
  signal: "bg-signal",
  stop: "bg-stop",
  dim: "bg-ink-faint",
};

export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-line bg-panel ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="label">{title}</h2>
          {aside}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

/** Label above value, value in mono. The unit of this whole interface. */
export function Field({
  label,
  value,
  tone,
  mono = true,
  size = "sm",
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  mono?: boolean;
  size?: "sm" | "lg";
}) {
  return (
    <div className="min-w-0">
      <div className="label mb-1.5">{label}</div>
      <div
        className={[
          mono ? "font-mono" : "",
          size === "lg" ? "text-2xl" : "text-sm",
          tone ? toneText[tone] : "text-ink",
          "truncate tabular-nums",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

export function Dot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  return (
    <span
      className={`inline-block size-1.5 shrink-0 ${toneBg[tone]} ${pulse ? "animate-pulse" : ""}`}
    />
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  variant = "default",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "quiet";
  type?: "button" | "submit";
}) {
  const styles = {
    default: "border-line-strong text-ink hover:border-ink-faint hover:bg-raised",
    primary: "border-signal text-signal hover:bg-signal-dim/30",
    quiet: "border-transparent text-ink-dim hover:text-ink hover:border-line-strong",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Th({ children, align = "left", w }: { children: ReactNode; align?: "left" | "right"; w?: string }) {
  return (
    <th
      style={w ? { width: w } : undefined}
      className={`label border-b border-line px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  mono = true,
  tone,
}: {
  children: ReactNode;
  align?: "left" | "right";
  mono?: boolean;
  tone?: Tone;
}) {
  return (
    <td
      className={[
        "border-b border-line/60 px-3 py-2 text-xs",
        mono ? "font-mono" : "",
        align === "right" ? "text-right" : "",
        tone ? toneText[tone] : "text-ink-dim",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-line px-3 py-10 text-center text-xs text-ink-faint">
      {children}
    </div>
  );
}

/** Mono, middle-truncated. For uuids and digests, which must stay copyable. */
export function Id({ value, head = 8 }: { value: string; head?: number }) {
  return (
    <span title={value} className="font-mono text-ink-faint">
      {value.slice(0, head)}…
    </span>
  );
}
