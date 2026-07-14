import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, jobs, leads, products, scoutScans, settings, type Job } from "@/db";
import {
  handleClassifyComplaints,
  handleDiscoverCompetitors,
  handleFullPipeline,
  handleGenerateLeads,
  handleMineComplaints,
  handleProfileProduct,
  handleRefreshData,
  handleScoutScan,
  handleTrackReplies,
  type Progress,
} from "./handlers";

/**
 * In-process job runner (the free-tier stand-in for pg-boss/BullMQ).
 * Jobs persist in SQLite so the dashboard can poll progress; execution is a
 * small in-memory worker with bounded concurrency, started lazily.
 */
const MAX_RUNNING = Number(process.env.JOB_CONCURRENCY ?? 2);

interface RunnerState {
  running: Set<number>;
  pumping: boolean;
  booted: boolean;
}
const g = globalThis as unknown as { __jobRunner?: RunnerState };
const state: RunnerState =
  g.__jobRunner ?? (g.__jobRunner = { running: new Set(), pumping: false, booted: false });

function bootRecover() {
  if (state.booted) return;
  state.booted = true;
  // Jobs left "running" by a previous process are orphans — fail them cleanly.
  db.update(jobs)
    .set({
      status: "failed",
      error: "interrupted by server restart — run again",
      finishedAt: Date.now(),
    })
    .where(eq(jobs.status, "running"))
    .run();
  db.update(scoutScans)
    .set({ status: "failed", error: "interrupted by server restart" })
    .where(inArray(scoutScans.status, ["running", "queued"]))
    .run();
}

export function enqueueJob(
  type: Job["type"],
  payload: Record<string, unknown> = {},
  productId?: number,
): number {
  bootRecover();
  const res = db
    .insert(jobs)
    .values({
      type,
      payloadJson: JSON.stringify(payload),
      productId: productId ?? null,
      status: "queued",
    })
    .run();
  const id = Number(res.lastInsertRowid);
  void pump();
  return id;
}

async function pump() {
  if (state.pumping) return;
  state.pumping = true;
  try {
    while (state.running.size < MAX_RUNNING) {
      const next = db
        .select()
        .from(jobs)
        .where(eq(jobs.status, "queued"))
        .orderBy(asc(jobs.id))
        .limit(1)
        .get();
      if (!next) break;
      db.update(jobs)
        .set({ status: "running", startedAt: Date.now(), message: "starting…" })
        .where(eq(jobs.id, next.id))
        .run();
      state.running.add(next.id);
      void runJob(next).finally(() => {
        state.running.delete(next.id);
        void pump();
      });
    }
  } finally {
    state.pumping = false;
  }
}

export class JobCancelledError extends Error {
  constructor() {
    super("cancelled by user");
    this.name = "JobCancelledError";
  }
}

/** Request cancellation. Queued jobs stop immediately; running jobs stop at
 * their next progress checkpoint (between pipeline stages / batch items). */
export function cancelJob(jobId: number): boolean {
  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job || (job.status !== "queued" && job.status !== "running")) return false;
  db.update(jobs)
    .set({
      status: "cancelled",
      message: job.status === "queued" ? "cancelled before start" : "stopping…",
      finishedAt: job.status === "queued" ? Date.now() : null,
    })
    .where(eq(jobs.id, jobId))
    .run();
  return true;
}

async function runJob(job: Job) {
  const progress: Progress = (pct, msg) => {
    // cooperative cancellation: the user flipped the row to "cancelled"
    const current = db
      .select({ status: jobs.status })
      .from(jobs)
      .where(eq(jobs.id, job.id))
      .get();
    if (current?.status === "cancelled") throw new JobCancelledError();
    db.update(jobs)
      .set({ progress: Math.min(100, Math.max(0, Math.round(pct))), message: msg })
      .where(eq(jobs.id, job.id))
      .run();
  };
  try {
    const payload = JSON.parse(job.payloadJson) as Record<string, unknown>;
    const productId = job.productId ?? (payload.productId as number | undefined);
    switch (job.type) {
      case "profile_product":
        await handleProfileProduct(requireId(productId), progress);
        break;
      case "discover_competitors":
        await handleDiscoverCompetitors(requireId(productId), progress);
        break;
      case "mine_complaints":
        await handleMineComplaints(requireId(productId), progress);
        break;
      case "classify_complaints":
        await handleClassifyComplaints(requireId(productId), progress);
        break;
      case "reclassify_skipped":
        await handleClassifyComplaints(requireId(productId), progress, {
          includeSkipped: true,
        });
        break;
      case "generate_leads":
        await handleGenerateLeads(requireId(productId), progress);
        break;
      case "refresh_data":
        await handleRefreshData(requireId(productId), progress);
        break;
      case "full_pipeline":
        await handleFullPipeline(requireId(productId), progress);
        break;
      case "scout_scan":
        await handleScoutScan(
          payload as unknown as { scanId: number; query: string },
          progress,
        );
        break;
      case "track_replies":
        await handleTrackReplies(progress);
        break;
    }
    db.update(jobs)
      .set({ status: "completed", progress: 100, finishedAt: Date.now() })
      .where(eq(jobs.id, job.id))
      .run();
  } catch (e) {
    if (e instanceof JobCancelledError) {
      db.update(jobs)
        .set({ status: "cancelled", message: "cancelled", finishedAt: Date.now() })
        .where(eq(jobs.id, job.id))
        .run();
      return;
    }
    db.update(jobs)
      .set({
        status: "failed",
        error: (e as Error).message?.slice(0, 500) ?? "unknown error",
        finishedAt: Date.now(),
      })
      .where(eq(jobs.id, job.id))
      .run();
    if (job.type === "scout_scan") {
      const payload = JSON.parse(job.payloadJson) as { scanId?: number };
      if (payload.scanId)
        db.update(scoutScans)
          .set({ status: "failed", error: (e as Error).message?.slice(0, 300) })
          .where(eq(scoutScans.id, payload.scanId))
          .run();
    }
  }
}

function requireId(id: number | undefined): number {
  if (!id) throw new Error("job payload is missing productId");
  return id;
}

/* ---------------- auto-refresh scheduler ---------------- */

const SCHEDULER_TICK_MS = 10 * 60 * 1000;
const gs = globalThis as unknown as { __refreshScheduler?: ReturnType<typeof setInterval> };

/** Started once per server process (instrumentation.ts). Re-crawls every
 * ready product when `auto_refresh_hours` (Settings) has elapsed since its
 * last completed refresh or pipeline run. */
export function startScheduler() {
  bootRecover();
  if (gs.__refreshScheduler) return;
  gs.__refreshScheduler = setInterval(schedulerTick, SCHEDULER_TICK_MS);
  // also evaluate shortly after boot so restarts don't skip a due refresh
  setTimeout(schedulerTick, 30_000);
}

function schedulerTick() {
  try {
    const raw = db.select().from(settings).where(eq(settings.key, "auto_refresh_hours")).get();
    const hours = Number(raw?.value ?? 0);
    if (!Number.isFinite(hours) || hours <= 0) return;
    const cutoff = Date.now() - hours * 3600_000;

    const ready = db.select().from(products).where(eq(products.status, "ready")).all();
    for (const p of ready) {
      const recent = db
        .select()
        .from(jobs)
        .where(eq(jobs.productId, p.id))
        .orderBy(desc(jobs.id))
        .limit(5)
        .all();
      const active = recent.some((j) => j.status === "queued" || j.status === "running");
      if (active) continue;
      const lastRefresh = recent.find(
        (j) =>
          (j.type === "refresh_data" || j.type === "full_pipeline") &&
          j.status === "completed",
      );
      if (lastRefresh && (lastRefresh.finishedAt ?? 0) > cutoff) continue;
      enqueueJob("refresh_data", { productId: p.id, scheduled: true }, p.id);
    }

    // reply tracking: poll sent-lead threads on the same cadence
    const anySent = db
      .select({ n: sql<number>`count(*)` })
      .from(leads)
      .where(eq(leads.status, "sent"))
      .get();
    if ((anySent?.n ?? 0) > 0) {
      const recentReplyJob = db
        .select()
        .from(jobs)
        .where(eq(jobs.type, "track_replies"))
        .orderBy(desc(jobs.id))
        .limit(1)
        .get();
      const activeReply =
        recentReplyJob &&
        (recentReplyJob.status === "queued" || recentReplyJob.status === "running");
      const dueReply =
        !recentReplyJob || (recentReplyJob.finishedAt ?? 0) <= cutoff;
      if (!activeReply && dueReply) enqueueJob("track_replies", {});
    }
  } catch {
    /* scheduler must never crash the server */
  }
}
