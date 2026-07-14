import { desc, eq } from "drizzle-orm";
import { Send } from "lucide-react";
import Link from "next/link";
import { competitors, complaints, db, leads, products } from "@/db";
import { styleStats } from "@/lib/analysis/leads";
import { LeadCard, type LeadView } from "@/components/lead-card";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const FILTERS = [
  { id: "review", label: "To review", statuses: ["new", "drafted"] },
  { id: "approved", label: "Approved", statuses: ["approved"] },
  { id: "sent", label: "Sent", statuses: ["sent", "replied"] },
  { id: "won", label: "Won", statuses: ["trial", "converted"] },
  { id: "rejected", label: "Rejected", statuses: ["rejected"] },
  { id: "all", label: "All", statuses: [] },
];

const LEADS_PER_PAGE = 20;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; productId?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.id === sp.filter) ?? FILTERS[0];
  const productId = sp.productId ? Number(sp.productId) : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const styles = styleStats();

  let rows = db
    .select({
      lead: leads,
      complaint: complaints,
      competitorName: competitors.name,
      productName: products.name,
    })
    .from(leads)
    .innerJoin(complaints, eq(leads.complaintId, complaints.id))
    .innerJoin(products, eq(leads.productId, products.id))
    .leftJoin(competitors, eq(complaints.competitorId, competitors.id))
    .orderBy(desc(leads.score))
    .all();

  if (productId) rows = rows.filter((r) => r.lead.productId === productId);
  const filtered = filter.statuses.length
    ? rows.filter((r) => filter.statuses.includes(r.lead.status))
    : rows;

  const countFor = (f: (typeof FILTERS)[number]) =>
    f.statuses.length
      ? rows.filter((r) => f.statuses.includes(r.lead.status)).length
      : rows.length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / LEADS_PER_PAGE));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (current - 1) * LEADS_PER_PAGE,
    current * LEADS_PER_PAGE,
  );
  const pageHref = (p: number) =>
    `/leads?filter=${filter.id}${productId ? `&productId=${productId}` : ""}&page=${p}`;

  const views: LeadView[] = pageRows.map((r) => ({
    id: r.lead.id,
    status: r.lead.status,
    score: r.lead.score,
    channel: r.lead.channel,
    draft: r.lead.draft,
    finalMessage: r.lead.finalMessage,
    createdAt: r.lead.createdAt,
    productName: r.productName,
    competitorName: r.competitorName ?? "unknown",
    complaint: {
      title: r.complaint.title,
      body: r.complaint.body,
      source: r.complaint.source,
      sourceUrl: r.complaint.sourceUrl,
      author: r.complaint.author,
      category: r.complaint.category,
      feature: r.complaint.feature,
      payerScore: r.complaint.payerScore,
      intentScore: r.complaint.intentScore,
      fitScore: r.complaint.fitScore,
      postedAt: r.complaint.postedAt,
    },
  }));

  return (
    <>
      <PageHeader
        title="Win-Over Leads"
        subtitle="People publicly unhappy with a competitor. Review the draft, approve it, then post it yourself in the original thread — nothing sends automatically."
        actions={
          rows.length ? (
            <a
              href={`/api/export/leads${productId ? `?productId=${productId}` : ""}`}
              className="btn-ghost text-xs"
              download
            >
              ⬇ Export CSV
            </a>
          ) : undefined
        }
      />

      <nav className="flex flex-wrap gap-1 mb-6">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={`/leads?filter=${f.id}${productId ? `&productId=${productId}` : ""}`}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              filter.id === f.id
                ? "bg-accent/15 text-ink font-medium"
                : "text-ink-dim hover:text-ink hover:bg-surface-2"
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-xs text-ink-faint tabular-nums">
              {countFor(f)}
            </span>
          </Link>
        ))}
        {productId && (
          <Link
            href={`/leads?filter=${filter.id}`}
            className="ml-auto rounded-lg px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
          >
            ✕ clear product filter
          </Link>
        )}
      </nav>

      {styles.length > 0 && styles.some((s) => s.sent > 0) && (
        <div className="card p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              Reply rate by message style
            </span>
            <span className="text-[11px] text-ink-faint">
              (A/B tested — the winning style gets used more)
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {styles.map((s) => (
              <Badge key={s.variant} tone={s.replyRate >= 20 ? "good" : "gray"}>
                {s.variant}: {s.replyRate}% ({s.replied}/{s.sent})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {!views.length ? (
        <EmptyState
          icon={Send}
          title={rows.length ? `No leads in “${filter.label}”` : "No leads yet"}
          body={
            rows.length
              ? "Switch filters above."
              : "Leads appear after a product pipeline runs: complaints with high switch-intent, payer likelihood, and product fit get a drafted reply."
          }
        />
      ) : (
        <>
          <ul className="space-y-4">
            {views.map((v) => (
              <LeadCard key={v.id} lead={v} />
            ))}
          </ul>
          {totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-3 text-sm">
              {current > 1 ? (
                <Link href={pageHref(current - 1)} className="btn-ghost !py-1.5">
                  ← Prev
                </Link>
              ) : (
                <span className="btn-ghost !py-1.5 opacity-40 pointer-events-none">← Prev</span>
              )}
              <span className="text-ink-faint tabular-nums">
                page {current} / {totalPages} · {filtered.length} leads
              </span>
              {current < totalPages ? (
                <Link href={pageHref(current + 1)} className="btn-ghost !py-1.5">
                  Next →
                </Link>
              ) : (
                <span className="btn-ghost !py-1.5 opacity-40 pointer-events-none">Next →</span>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
