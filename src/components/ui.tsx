import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-dim">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "accent" | "good" | "warn";
}) {
  const tones = {
    default: "text-ink",
    accent: "text-accent",
    good: "text-good",
    warn: "text-warn",
  };
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">
          {label}
        </span>
        {Icon && <Icon size={15} className="text-ink-faint" />}
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tones[tone]}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-faint">{hint}</div>}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  gray: "bg-surface-2 text-ink-dim border-border",
  accent: "bg-accent/15 text-accent border-accent/30",
  good: "bg-good/10 text-good border-good/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  bad: "bg-bad/10 text-bad border-bad/30",
};

export function Badge({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof BADGE_TONES {
  switch (status) {
    case "ready":
    case "completed":
    case "sent":
    case "converted":
    case "approved":
    case "adopted":
      return "good";
    case "running":
    case "scanning":
    case "profiling":
    case "drafted":
    case "trial":
    case "shortlisted":
    case "replied":
      return "accent";
    case "queued":
    case "new":
    case "candidate":
      return "gray";
    case "failed":
    case "error":
    case "rejected":
      return "bad";
    default:
      return "gray";
  }
}

/** 0–1 score as a small horizontal meter. */
export function ScoreBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const color = pct >= 60 ? "bg-good" : pct >= 30 ? "bg-warn" : "bg-ink-faint";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-ink-dim w-7 text-right">
        {label ?? `${pct}`}
      </span>
    </div>
  );
}

export function ProgressBar({ value, message }: { value: number; message?: string }) {
  return (
    <div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(2, value))}%` }}
        />
      </div>
      {message && <div className="mt-1.5 text-xs text-ink-dim">{message}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <span className="grid place-items-center size-12 rounded-xl bg-surface-2 text-ink-faint mb-4">
          <Icon size={22} />
        </span>
      )}
      <h3 className="font-medium">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm text-ink-dim">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
