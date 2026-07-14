import { desc, eq, sql } from "drizzle-orm";
import {
  AlertTriangle,
  ArrowRight,
  MessageSquareWarning,
  Package,
  Send,
  Telescope,
} from "lucide-react";
import Link from "next/link";
import { complaints, db, jobs, leads, opportunities, products } from "@/db";
import { allSpikes } from "@/lib/analysis/spikes";
import { JobsLive, type JobRow } from "@/components/jobs-live";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function OverviewPage() {
  const productCount =
    db.select({ n: sql<number>`count(*)` }).from(products).get()?.n ?? 0;
  const complaintCount =
    db
      .select({ n: sql<number>`count(*)` })
      .from(complaints)
      .where(
        sql`${complaints.category} is not null and ${complaints.category} != 'not_a_complaint'`,
      )
      .get()?.n ?? 0;
  const leadCounts = db
    .select({ status: leads.status, n: sql<number>`count(*)` })
    .from(leads)
    .groupBy(leads.status)
    .all();
  const pendingLeads = leadCounts
    .filter((r) => r.status === "new" || r.status === "drafted")
    .reduce((a, r) => a + Number(r.n), 0);
  const wonLeads = leadCounts
    .filter((r) => r.status === "trial" || r.status === "converted")
    .reduce((a, r) => a + Number(r.n), 0);
  const oppCount =
    db
      .select({ n: sql<number>`count(*)` })
      .from(opportunities)
      .where(eq(opportunities.status, "candidate"))
      .get()?.n ?? 0;

  const recentJobs = db
    .select()
    .from(jobs)
    .orderBy(desc(jobs.id))
    .limit(8)
    .all();

  // ---- weekly digest: this week vs. last week ----
  const week = 7 * 86_400_000;
  const now = Date.now();
  const countComplaintsSince = (from: number, to: number) =>
    db
      .select({ n: sql<number>`count(*)` })
      .from(complaints)
      .where(
        sql`${complaints.createdAt} >= ${from} and ${complaints.createdAt} < ${to} and ${complaints.status} = 'classified' and ${complaints.category} != 'not_a_complaint'`,
      )
      .get()?.n ?? 0;
  const countLeadsSince = (from: number, to: number) =>
    db
      .select({ n: sql<number>`count(*)` })
      .from(leads)
      .where(sql`${leads.createdAt} >= ${from} and ${leads.createdAt} < ${to}`)
      .get()?.n ?? 0;
  const digest = {
    complaintsThis: countComplaintsSince(now - week, now + 1),
    complaintsLast: countComplaintsSince(now - 2 * week, now - week),
    leadsThis: countLeadsSince(now - week, now + 1),
    leadsLast: countLeadsSince(now - 2 * week, now - week),
    topNewGaps: db
      .select({
        feature: sql<string>`coalesce(${complaints.feature}, ${complaints.category})`,
        n: sql<number>`count(*)`,
      })
      .from(complaints)
      .where(
        sql`${complaints.createdAt} >= ${now - week} and ${complaints.status} = 'classified' and ${complaints.category} != 'not_a_complaint' and coalesce(${complaints.fitScore}, 0) < 0.5`,
      )
      .groupBy(sql`coalesce(${complaints.feature}, ${complaints.category})`)
      .orderBy(desc(sql`count(*)`))
      .limit(3)
      .all(),
  };

  const spikes = allSpikes();
  const empty = productCount === 0 && oppCount === 0 && recentJobs.length === 0;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Competitor intelligence & win-over engine — Compete and Scout, working hand in hand."
      />

      {spikes.length > 0 && (
        <div className="mb-6 space-y-2">
          {spikes.map((s, i) => (
            <Link
              key={i}
              href={`/products/${s.productId}?tab=complaints&q=${encodeURIComponent(s.category.replace(/_/g, " "))}`}
              className="flex items-center gap-3 rounded-lg border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm hover:border-warn/50 transition-colors"
            >
              <AlertTriangle size={15} className="text-warn shrink-0" />
              <span className="text-ink">
                <b>{s.competitorName}</b> — {s.category.replace(/_/g, " ")} complaints spiked to{" "}
                <b className="tabular-nums">{s.thisWeek}</b> this week (avg {s.mean}, {s.z}σ). Their
                users are looking to switch — strike now.
              </span>
              <ArrowRight size={14} className="ml-auto text-ink-faint shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {empty ? (
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            icon={Package}
            title="Compete mode"
            body="Have a product? Add it (markdown, URL, or repo) and SwitchSignal will find competitors, mine their unhappy customers, and queue win-over leads."
            action={
              <Link href="/products/new" className="btn-primary">
                Add your product <ArrowRight size={15} />
              </Link>
            }
          />
          <EmptyState
            icon={Telescope}
            title="Scout mode"
            body="No product yet? Scan a category for profitable, low-overhead software with unhappy paying customers — then build the better version."
            action={
              <Link href="/scout" className="btn-ghost">
                Run a scout scan <ArrowRight size={15} />
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
            <StatCard label="Products" value={productCount} icon={Package} />
            <StatCard
              label="Complaints mined"
              value={complaintCount}
              icon={MessageSquareWarning}
            />
            <StatCard
              label="Leads awaiting review"
              value={pendingLeads}
              icon={Send}
              tone={pendingLeads > 0 ? "accent" : "default"}
            />
            <StatCard label="Trials + conversions" value={wonLeads} tone="good" />
            <StatCard
              label="Scout opportunities"
              value={oppCount}
              icon={Telescope}
            />
          </div>

          <div className="mt-6 card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Weekly digest</h2>
              <span className="text-xs text-ink-faint">last 7 days vs. previous 7</span>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <DigestStat
                label="New complaints"
                value={digest.complaintsThis}
                prev={digest.complaintsLast}
              />
              <DigestStat
                label="New leads"
                value={digest.leadsThis}
                prev={digest.leadsLast}
              />
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-ink-faint">
                  Top new gaps this week
                </div>
                {digest.topNewGaps.length ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {digest.topNewGaps.map((g) => (
                      <li key={g.feature} className="text-sm text-ink-dim">
                        {g.feature}{" "}
                        <span className="text-ink-faint tabular-nums">×{g.n}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-sm text-ink-faint">none yet</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
            <section>
              <h2 className="text-sm font-semibold text-ink-dim mb-3">
                Recent activity
              </h2>
              <JobsLive initial={recentJobs as JobRow[]} />
            </section>
            <section>
              <h2 className="text-sm font-semibold text-ink-dim mb-3">
                Quick actions
              </h2>
              <div className="space-y-3">
                <Link
                  href="/products/new"
                  className="card flex items-center justify-between p-4 hover:border-border-2 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium">Add a product</div>
                    <div className="text-xs text-ink-faint mt-0.5">
                      Run the Compete pipeline on your app
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-ink-faint" />
                </Link>
                <Link
                  href="/scout"
                  className="card flex items-center justify-between p-4 hover:border-border-2 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium">Scout a category</div>
                    <div className="text-xs text-ink-faint mt-0.5">
                      Find profitable software worth competing with
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-ink-faint" />
                </Link>
                <Link
                  href="/leads"
                  className="card flex items-center justify-between p-4 hover:border-border-2 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium">Review leads</div>
                    <div className="text-xs text-ink-faint mt-0.5">
                      {pendingLeads} draft{pendingLeads === 1 ? "" : "s"} waiting
                      for your approval
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-ink-faint" />
                </Link>
                <p className="flex items-start gap-2 text-xs text-ink-faint px-1">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  Nothing sends automatically — every outreach message needs
                  your approval in the Leads queue.
                </p>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function DigestStat({
  label,
  value,
  prev,
}: {
  label: string;
  value: number;
  prev: number;
}) {
  const delta = value - prev;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {prev > 0 || value > 0 ? (
          <span
            className={`text-xs tabular-nums ${
              delta > 0 ? "text-good" : delta < 0 ? "text-ink-faint" : "text-ink-faint"
            }`}
          >
            {delta >= 0 ? "+" : ""}
            {delta} vs last week
          </span>
        ) : null}
      </div>
    </div>
  );
}
