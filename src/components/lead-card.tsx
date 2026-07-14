"use client";

import {
  Check,
  Copy,
  ExternalLink,
  RefreshCcw,
  Send,
  ThumbsDown,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFeedback } from "./feedback";
import { Badge, ScoreBar, statusTone, timeAgo } from "./ui";

export interface LeadView {
  id: number;
  status: string;
  score: number;
  channel: string;
  draft: string;
  finalMessage: string;
  createdAt: number;
  productName: string;
  competitorName: string;
  complaint: {
    title: string;
    body: string;
    source: string;
    sourceUrl: string;
    author: string;
    category: string | null;
    feature: string | null;
    payerScore: number | null;
    intentScore: number | null;
    fitScore: number | null;
    postedAt: number | null;
  };
}

const NEXT_ACTIONS: Record<string, { to: string; label: string }[]> = {
  sent: [
    { to: "replied", label: "They replied" },
    { to: "trial", label: "Started trial" },
  ],
  replied: [
    { to: "trial", label: "Started trial" },
    { to: "converted", label: "Converted 🎉" },
  ],
  trial: [{ to: "converted", label: "Converted 🎉" }],
};

const STATUS_TOASTS: Record<string, string> = {
  approved: "message approved — post it in the thread, then hit “I posted it”",
  rejected: "lead rejected",
  sent: "marked as posted — good luck!",
  replied: "nice, they replied",
  trial: "trial started 🎉",
  converted: "converted — that's a win",
};

export function LeadCard({ lead }: { lead: LeadView }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(lead.finalMessage || lead.draft);
  const [copied, setCopied] = useState(false);

  async function patch(update: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const status = update.status as string | undefined;
      if (status && STATUS_TOASTS[status])
        toast(STATUS_TOASTS[status], status === "rejected" ? "default" : "good");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/draft`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.draft) setText(data.draft);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copyText() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const reviewable = lead.status === "new" || lead.status === "drafted";
  const approved = lead.status === "approved";

  return (
    <li className="card p-5">
      {/* complaint context */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={statusTone(lead.status)}>{lead.status}</Badge>
        <Badge tone="accent">{lead.competitorName}</Badge>
        <Badge>{lead.complaint.source}</Badge>
        {lead.complaint.category && (
          <Badge tone="warn">{lead.complaint.category.replace(/_/g, " ")}</Badge>
        )}
        <span className="text-ink-faint">for {lead.productName}</span>
        <span className="ml-auto flex items-center gap-3">
          <span className="text-ink-faint">lead score</span>
          <ScoreBar value={lead.score} />
        </span>
      </div>

      <div className="mt-3 rounded-lg bg-surface-2 border border-border/60 p-3">
        <div className="flex items-center gap-2 text-xs text-ink-faint">
          <span>
            {lead.complaint.author ? `u/${lead.complaint.author}` : "someone"} complained{" "}
            {lead.complaint.postedAt ? timeAgo(lead.complaint.postedAt) : "(date unknown)"}:
          </span>
          {lead.complaint.sourceUrl && (
            <a
              href={lead.complaint.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-accent hover:underline"
            >
              open thread <ExternalLink size={11} />
            </a>
          )}
        </div>
        {lead.complaint.title && (
          <div className="mt-1.5 text-sm font-medium">{lead.complaint.title}</div>
        )}
        <p className="mt-1 text-sm text-ink-dim line-clamp-3">{lead.complaint.body}</p>
      </div>

      {/* draft */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="label-caps !mb-0">
            {approved ? "Approved message — post it in the thread above" : "Draft reply"}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="btn-ghost !px-2 !py-1 text-[11px]"
              onClick={regenerate}
              disabled={busy}
              title="Regenerate draft"
            >
              <RefreshCcw size={12} />
            </button>
            <button
              className="btn-ghost !px-2 !py-1 text-[11px]"
              onClick={copyText}
              title="Copy message"
            >
              <Copy size={12} /> {copied ? "copied!" : "copy"}
            </button>
          </div>
        </div>
        {editing ? (
          <textarea
            className="input-base min-h-28 text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        ) : (
          <p
            className="rounded-lg border border-dashed border-border-2 p-3 text-sm cursor-text whitespace-pre-wrap"
            onClick={() => reviewable && setEditing(true)}
            title={reviewable ? "Click to edit" : undefined}
          >
            {text || <span className="text-ink-faint">No draft yet — hit regenerate.</span>}
          </p>
        )}
      </div>

      {/* actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2 justify-end">
        {reviewable && (
          <>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => patch({ status: "rejected" })}
            >
              <ThumbsDown size={13} /> Reject
            </button>
            <button
              className="btn-primary"
              disabled={busy || !text.trim()}
              onClick={() => {
                setEditing(false);
                void patch({ status: "approved", finalMessage: text });
              }}
            >
              <Check size={13} /> Approve message
            </button>
          </>
        )}
        {approved && (
          <>
            <button className="btn-ghost" disabled={busy} onClick={() => patch({ status: "drafted" })}>
              <X size={13} /> Back to review
            </button>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => patch({ status: "sent" })}
              title="Mark as posted — you post it yourself in the thread"
            >
              <Send size={13} /> I posted it
            </button>
          </>
        )}
        {NEXT_ACTIONS[lead.status]?.map((a) => (
          <button
            key={a.to}
            className="btn-ghost"
            disabled={busy}
            onClick={() => patch({ status: a.to })}
          >
            {a.label}
          </button>
        ))}
        {lead.status === "rejected" && (
          <button className="btn-ghost" disabled={busy} onClick={() => patch({ status: "drafted" })}>
            restore
          </button>
        )}
      </div>
    </li>
  );
}
