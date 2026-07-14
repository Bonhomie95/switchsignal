"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, ProgressBar, statusTone, timeAgo } from "./ui";

export interface JobRow {
  id: number;
  type: string;
  status: string;
  progress: number;
  message: string;
  error: string | null;
  productId: number | null;
  createdAt: number;
}

const TYPE_LABELS: Record<string, string> = {
  full_pipeline: "Full pipeline",
  profile_product: "Profile product",
  discover_competitors: "Discover competitors",
  mine_complaints: "Mine complaints",
  classify_complaints: "Classify complaints",
  generate_leads: "Generate leads",
  scout_scan: "Scout scan",
};

/** Polls /api/jobs while anything is active; refreshes server components when a job finishes. */
export function JobsLive({
  productId,
  initial,
  limit = 8,
}: {
  productId?: number;
  initial: JobRow[];
  limit?: number;
}) {
  const [rows, setRows] = useState<JobRow[]>(initial);
  const router = useRouter();
  const activeIds = useRef(new Set(initial.filter(isActive).map((j) => j.id)));

  // apply a fresh snapshot; refresh server components when an active job ends
  const apply = useCallback(
    (next: JobRow[]) => {
      setRows(next);
      const nowActive = new Set(next.filter(isActive).map((j) => j.id));
      for (const id of activeIds.current)
        if (!nowActive.has(id)) {
          router.refresh();
          break;
        }
      activeIds.current = nowActive;
    },
    [router],
  );

  const poll = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (productId) qs.set("productId", String(productId));
      const res = await fetch(`/api/jobs?${qs}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: JobRow[] };
      apply(data.jobs);
    } catch {
      /* transient */
    }
  }, [productId, limit, apply]);

  // Prefer SSE (push, no polling); fall back to interval polling if it fails.
  useEffect(() => {
    if (typeof EventSource === "undefined") {
      const t = setInterval(poll, 2500);
      return () => clearInterval(t);
    }
    const qs = new URLSearchParams({ limit: String(limit) });
    if (productId) qs.set("productId", String(productId));
    const es = new EventSource(`/api/jobs/stream?${qs}`);
    let fallback: ReturnType<typeof setInterval> | undefined;
    es.onmessage = (e) => {
      try {
        apply(JSON.parse(e.data) as JobRow[]);
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => {
      es.close();
      if (!fallback) fallback = setInterval(poll, 2500);
    };
    return () => {
      es.close();
      if (fallback) clearInterval(fallback);
    };
  }, [productId, limit, poll, apply]);

  if (!rows.length)
    return <p className="text-sm text-ink-faint">No jobs yet.</p>;

  return (
    <ul className="space-y-3">
      {rows.map((j) => (
        <li key={j.id} className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-sm font-medium truncate">
                {TYPE_LABELS[j.type] ?? j.type}
              </span>
              <Badge tone={statusTone(j.status)}>{j.status}</Badge>
            </div>
            <span className="text-xs text-ink-faint shrink-0">
              {timeAgo(j.createdAt)}
            </span>
          </div>
          {isActive(j) && (
            <div className="mt-3 flex items-end gap-3">
              <div className="flex-1">
                <ProgressBar value={j.progress} message={j.message} />
              </div>
              <button
                className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-ink-faint hover:text-bad hover:border-bad/40 transition-colors cursor-pointer"
                onClick={async () => {
                  await fetch(`/api/jobs/${j.id}/cancel`, { method: "POST" });
                  void poll();
                }}
                title="Cancel this job"
              >
                cancel
              </button>
            </div>
          )}
          {j.status === "completed" && j.message && (
            <p className="mt-2 text-xs text-ink-dim">{j.message}</p>
          )}
          {j.status === "failed" && (
            <p className="mt-2 text-xs text-bad">{j.error ?? "failed"}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function isActive(j: JobRow) {
  return j.status === "queued" || j.status === "running";
}
