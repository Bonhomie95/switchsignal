import { desc, eq, sql } from "drizzle-orm";
import { ExternalLink, Telescope } from "lucide-react";
import Link from "next/link";
import { db, jobs, opportunities, scoutScans } from "@/db";
import { JobsLive, type JobRow } from "@/components/jobs-live";
import { OpportunityActions } from "@/components/opportunity-actions";
import { ScoutForm } from "@/components/scout-form";
import {
  Badge,
  EmptyState,
  PageHeader,
  ScoreBar,
  statusTone,
} from "@/components/ui";

export const dynamic = "force-dynamic";

interface Evidence {
  claim: string;
  url: string;
  source: string;
  reliability: "low" | "medium" | "high";
  verified?: boolean;
}

export default async function ScoutPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const show = (await searchParams).show ?? "active";

  const scoutJobs = db
    .select()
    .from(jobs)
    .where(eq(jobs.type, "scout_scan"))
    .orderBy(desc(jobs.id))
    .limit(3)
    .all();
  const hasActive = scoutJobs.some(
    (j) => j.status === "queued" || j.status === "running",
  );

  const opps = db
    .select()
    .from(opportunities)
    .orderBy(desc(opportunities.opportunityScore))
    .all()
    .filter((o) =>
      show === "all"
        ? true
        : show === "dismissed"
          ? o.status === "dismissed"
          : o.status !== "dismissed",
    );

  const scans = db
    .select()
    .from(scoutScans)
    .orderBy(desc(scoutScans.id))
    .limit(5)
    .all();

  return (
    <>
      <PageHeader
        title="Scout"
        subtitle="Find high-revenue, low-overhead software with unhappy paying customers — then build the better version."
      />

      <ScoutForm />

      {(hasActive || scoutJobs[0]?.status === "failed") && (
        <div className="mt-5">
          <JobsLive initial={scoutJobs as JobRow[]} limit={3} />
        </div>
      )}

      {scans.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
          Recent scans:
          {scans.map((s) => (
            <Badge key={s.id} tone={statusTone(s.status)}>
              {s.query} · {s.status}
              {s.status === "completed" ? ` · ${s.resultCount}` : ""}
            </Badge>
          ))}
          <span className="ml-auto flex gap-2">
            {["active", "dismissed", "all"].map((f) => (
              <Link
                key={f}
                href={`/scout?show=${f}`}
                className={show === f ? "text-ink font-medium" : "hover:text-ink"}
              >
                {f}
              </Link>
            ))}
          </span>
        </div>
      )}

      <div className="mt-6">
        {!opps.length ? (
          <EmptyState
            icon={Telescope}
            title="No opportunities yet"
            body="Run a scan above. Results are ranked by revenue signal × paying customers × complaint volume × build feasibility × competition thinness. Revenue figures are evidence-backed estimates — always check the links."
          />
        ) : (
          <ul className="space-y-4">
            {opps.map((o, i) => {
              const evidence: Evidence[] = o.revenueEvidenceJson
                ? JSON.parse(o.revenueEvidenceJson)
                : [];
              return (
                <li key={o.id} className="card p-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="grid place-items-center size-8 rounded-lg bg-surface-2 text-sm font-semibold text-ink-dim shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{o.name}</h3>
                        {o.url && (
                          <a
                            href={o.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-ink-faint hover:text-accent"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                        <Badge>{o.category}</Badge>
                        <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                        {o.timesSeen > 1 && o.previousScore != null && (
                          <Badge
                            tone={
                              o.opportunityScore > o.previousScore
                                ? "good"
                                : o.opportunityScore < o.previousScore
                                  ? "bad"
                                  : "gray"
                            }
                          >
                            {o.opportunityScore > o.previousScore
                              ? "▲ rising"
                              : o.opportunityScore < o.previousScore
                                ? "▼ falling"
                                : "steady"}{" "}
                            · seen {o.timesSeen}×
                          </Badge>
                        )}
                        <span className="ml-auto text-xl font-semibold tabular-nums text-accent">
                          {o.opportunityScore}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-ink-dim">{o.summary}</p>
                      {o.whyWinnable && (
                        <p className="mt-1.5 text-sm">
                          <span className="text-ink-faint">Why winnable: </span>
                          {o.whyWinnable}
                        </p>
                      )}

                      <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 max-w-2xl">
                        <Signal label="revenue signal" value={o.revenueSignal} />
                        <Signal label="paying customers" value={o.payerVolume} />
                        <Signal label="complaint volume" value={o.complaintVolume} />
                        <Signal label="feasibility" value={o.feasibility} />
                        <Signal label="competition thin" value={o.competitionThinness} />
                      </div>

                      {evidence.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {evidence.map((e, j) => (
                            <a
                              key={j}
                              href={e.url || undefined}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
                                e.reliability === "high"
                                  ? "border-good/40 text-good"
                                  : e.reliability === "medium"
                                    ? "border-warn/40 text-warn"
                                    : "border-border text-ink-faint"
                              } ${e.url ? "hover:underline" : "cursor-default"}`}
                            >
                              {e.verified ? "✓ " : ""}
                              {e.claim} · {e.source} ({e.reliability})
                            </a>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 flex items-center justify-end">
                        <OpportunityActions id={o.id} status={o.status} />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function Signal({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-ink-faint w-28 shrink-0">
        {label}
      </span>
      <ScoreBar value={value} />
    </div>
  );
}
