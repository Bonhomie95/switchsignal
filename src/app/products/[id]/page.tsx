import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  competitors,
  complaints,
  db,
  jobs,
  leads,
  pricingSnapshots,
  products,
} from "@/db";
import { featureReport } from "@/lib/analysis/reports";
import { searchComplaintIds } from "@/lib/analysis/search";
import { bucketByWeek, TrendChart } from "@/components/trend-chart";
import { ComplaintSearch } from "@/components/complaint-search";
import { JobsLive, type JobRow } from "@/components/jobs-live";
import { ProductActions } from "@/components/product-actions";
import { ShipButton } from "@/components/ship-button";
import {
  Badge,
  PageHeader,
  ScoreBar,
  statusTone,
  timeAgo,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const TABS = ["radar", "complaints", "competitors", "leads", "profile"] as const;
type Tab = (typeof TABS)[number];

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string; q?: string }>;
}) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "radar";
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").slice(0, 100);

  const product = db.select().from(products).where(eq(products.id, id)).get();
  if (!product) notFound();

  const productJobs = db
    .select()
    .from(jobs)
    .where(eq(jobs.productId, id))
    .orderBy(desc(jobs.id))
    .limit(3)
    .all();
  const hasActiveJob = productJobs.some(
    (j) => j.status === "queued" || j.status === "running",
  );

  const profile = product.profileJson
    ? (JSON.parse(product.profileJson) as {
        name: string;
        category: string;
        description: string;
        features: string[];
        persona: string;
        pricing: string;
        differentiators: string[];
      })
    : null;

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={profile ? `${profile.category} · ${profile.persona}` : "profile pending…"}
        actions={<ProductActions productId={id} hasProfile={!!profile} />}
      />

      {(hasActiveJob || productJobs[0]?.status === "failed") && (
        <div className="mb-6">
          <JobsLive productId={id} initial={productJobs as JobRow[]} limit={3} />
        </div>
      )}

      <nav className="flex gap-1 border-b border-border mb-6">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/products/${id}?tab=${t}`}
            className={`px-4 py-2.5 text-sm capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-accent text-ink font-medium"
                : "border-transparent text-ink-dim hover:text-ink"
            }`}
          >
            {t === "radar" ? "Build Radar" : t}
          </Link>
        ))}
      </nav>

      {tab === "radar" && <RadarTab productId={id} />}
      {tab === "complaints" && <ComplaintsTab productId={id} page={page} q={q} />}
      {tab === "competitors" && <CompetitorsTab productId={id} />}
      {tab === "leads" && <LeadsTab productId={id} />}
      {tab === "profile" && <ProfileTab profile={profile} rawInput={product.rawInput} />}
    </>
  );
}

/* ---------------- Build Radar ---------------- */

function RadarTab({ productId }: { productId: number }) {
  const gaps = featureReport(productId, "gap");
  const ammo = featureReport(productId, "ammo");
  const trendRows = db
    .select({
      postedAt: complaints.postedAt,
      createdAt: complaints.createdAt,
      category: complaints.category,
    })
    .from(complaints)
    .where(
      and(
        eq(complaints.productId, productId),
        eq(complaints.status, "classified"),
        sql`${complaints.category} != 'not_a_complaint'`,
      ),
    )
    .all();
  const buckets = bucketByWeek(trendRows);
  const hasTrend = buckets.some((b) => b.total > 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2 -mb-2">
        <a href={`/api/export/gaps?productId=${productId}&kind=gap`} className="btn-ghost !py-1.5 text-xs" download>
          ⬇ Gap report CSV
        </a>
        <a href={`/api/export/gaps?productId=${productId}&kind=ammo`} className="btn-ghost !py-1.5 text-xs" download>
          ⬇ Ammo report CSV
        </a>
      </div>
      {hasTrend && (
        <section className="card p-5">
          <h2 className="font-medium text-sm">Complaint trend — last 8 weeks</h2>
          <p className="mt-0.5 mb-4 text-xs text-ink-faint">
            Volume by category across all competitors. Spikes often follow a competitor&apos;s
            bad release — that&apos;s your window.
          </p>
          <TrendChart buckets={buckets} />
        </section>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <ReportTable
          title="Gap Report — build next"
          subtitle="Complaints your product does NOT solve yet, ranked by frequency × payer likelihood × switch intent. Hover a row and hit “ship” once you build it."
          rows={gaps}
          empty="No gaps found yet — run the pipeline or refresh data."
          productId={productId}
          shippable
        />
        <ReportTable
          title="Ammo Report — marketing angles"
          subtitle="Complaints your product already solves. Lead with these."
          rows={ammo}
          empty="Nothing here yet — gaps show up first if your fit scores are low."
          productId={productId}
        />
      </div>
    </div>
  );
}

function ReportTable({
  title,
  subtitle,
  rows,
  empty,
  productId,
  shippable = false,
}: {
  title: string;
  subtitle: string;
  rows: ReturnType<typeof featureReport>;
  empty: string;
  productId: number;
  shippable?: boolean;
}) {
  return (
    <section className="card overflow-hidden">
      <header className="px-5 pt-4 pb-3 border-b border-border">
        <h2 className="font-medium text-sm">{title}</h2>
        <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>
      </header>
      {!rows.length ? (
        <p className="px-5 py-8 text-sm text-ink-faint text-center">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="px-5 py-2 font-medium">Feature / issue</th>
              <th className="px-2 py-2 font-medium text-right">Count</th>
              <th className="px-2 py-2 font-medium">Payer</th>
              <th className="px-2 py-2 font-medium">Intent</th>
              <th
                className="px-5 py-2 font-medium text-right"
                title="Demand rank: complaint count weighted by payer likelihood, switch intent, and severity. Relative to the top row — 100 is the strongest signal in this table."
              >
                Priority ⓘ
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const topScore = rows[0]?.score || 1;
              const rel = Math.round((r.score / topScore) * 100);
              return (
                <tr
                  key={`${r.feature}:${r.category}`}
                  className={`group border-t border-border/60 ${r.shipped ? "opacity-60" : ""}`}
                >
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.feature}</span>
                      {(shippable || r.shipped) && (
                        <ShipButton
                          productId={productId}
                          feature={r.feature}
                          shipped={r.shipped}
                        />
                      )}
                    </div>
                    <div className="text-[11px] text-ink-faint">{r.category.replace(/_/g, " ")}</div>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{r.count}</td>
                  <td className="px-2 py-2.5"><ScoreBar value={r.avgPayer} /></td>
                  <td className="px-2 py-2.5"><ScoreBar value={r.avgIntent} /></td>
                  <td
                    className="px-5 py-2.5"
                    title={`raw score ${r.score} — count × payer × intent × severity weighting`}
                  >
                    <div className="flex items-center gap-2 justify-end">
                      <div className="h-1.5 w-16 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${rel}%` }}
                        />
                      </div>
                      <span className="font-semibold tabular-nums text-accent w-8 text-right">
                        {rel}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}

/* ---------------- Complaints ---------------- */

const COMPLAINTS_PER_PAGE = 25;

function ComplaintsTab({
  productId,
  page,
  q,
}: {
  productId: number;
  page: number;
  q: string;
}) {
  const searchIds = q ? searchComplaintIds(q) : null;
  const filters = and(
    eq(complaints.productId, productId),
    eq(complaints.status, "classified"),
    sql`${complaints.category} != 'not_a_complaint'`,
    searchIds !== null
      ? searchIds.length
        ? inArray(complaints.id, searchIds)
        : sql`0`
      : undefined,
  );
  const total =
    db.select({ n: sql<number>`count(*)` }).from(complaints).where(filters).get()?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / COMPLAINTS_PER_PAGE));
  const current = Math.min(page, totalPages);

  const rows = db
    .select({
      c: complaints,
      competitorName: competitors.name,
    })
    .from(complaints)
    .leftJoin(competitors, eq(complaints.competitorId, competitors.id))
    .where(filters)
    .orderBy(desc(sql`coalesce(${complaints.intentScore},0) * coalesce(${complaints.payerScore},0)`))
    .limit(COMPLAINTS_PER_PAGE)
    .offset((current - 1) * COMPLAINTS_PER_PAGE)
    .all();

  return (
    <>
    <div className="mb-4">
      <ComplaintSearch productId={productId} initialQuery={q} />
    </div>
    {!rows.length ? (
      <p className="text-sm text-ink-faint py-8 text-center">
        {q
          ? `No complaints match “${q}”.`
          : "No classified complaints yet. Run the pipeline, then check back."}
      </p>
    ) : (
    <>
    <ul className="space-y-3">
      {rows.map(({ c, competitorName }) => (
        <li key={c.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="accent">{competitorName ?? "unknown"}</Badge>
            <Badge>{c.source}</Badge>
            <Badge tone="warn">{(c.category ?? "other").replace(/_/g, " ")}</Badge>
            {c.feature && <Badge>{c.feature}</Badge>}
            <span className="ml-auto text-ink-faint">{timeAgo(c.postedAt)}</span>
          </div>
          {c.title && <h3 className="mt-2 text-sm font-medium">{c.title}</h3>}
          <p className="mt-1 text-sm text-ink-dim line-clamp-3">{c.body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Metric label="payer" value={c.payerScore} />
            <Metric label="intent" value={c.intentScore} />
            <Metric label="fit" value={c.fitScore} />
            <Metric label="severity" value={c.severity} />
            {c.sourceUrl && (
              <a
                href={c.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                source <ExternalLink size={11} />
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
    {totalPages > 1 && (
      <nav className="mt-5 flex items-center justify-center gap-3 text-sm">
        {current > 1 ? (
          <Link href={`/products/${productId}?tab=complaints&page=${current - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="btn-ghost !py-1.5">
            ← Prev
          </Link>
        ) : (
          <span className="btn-ghost !py-1.5 opacity-40 pointer-events-none">← Prev</span>
        )}
        <span className="text-ink-faint tabular-nums">
          page {current} / {totalPages} · {total} complaints
        </span>
        {current < totalPages ? (
          <Link href={`/products/${productId}?tab=complaints&page=${current + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="btn-ghost !py-1.5">
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

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-ink-faint w-12">{label}</span>
      <ScoreBar value={value ?? 0} />
    </div>
  );
}

/* ---------------- Competitors ---------------- */

function CompetitorsTab({ productId }: { productId: number }) {
  const rows = db
    .select()
    .from(competitors)
    .where(eq(competitors.productId, productId))
    .orderBy(desc(competitors.id))
    .all();
  const counts = new Map(
    db
      .select({ competitorId: complaints.competitorId, n: sql<number>`count(*)` })
      .from(complaints)
      .where(
        and(
          eq(complaints.productId, productId),
          sql`${complaints.category} is not null and ${complaints.category} != 'not_a_complaint'`,
        ),
      )
      .groupBy(complaints.competitorId)
      .all()
      .map((r) => [r.competitorId, Number(r.n)]),
  );
  const snapshots = rows.length
    ? db
        .select()
        .from(pricingSnapshots)
        .where(inArray(pricingSnapshots.competitorId, rows.map((r) => r.id)))
        .orderBy(desc(pricingSnapshots.id))
        .all()
    : [];

  if (!rows.length)
    return (
      <p className="text-sm text-ink-faint py-8 text-center">
        No competitors discovered yet — run the pipeline.
      </p>
    );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((comp) => {
        const snaps = snapshots.filter((s) => s.competitorId === comp.id);
        const latest = snaps[0];
        const changes = snaps.filter((s) => s.changeSummary).slice(0, 3);
        const plans: { plan: string; price: string; period: string }[] = latest
          ? JSON.parse(latest.pricingJson)
          : [];
        return (
          <div key={comp.id} className="card p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-medium">{comp.name}</h3>
                {comp.url && (
                  <a
                    href={comp.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent hover:underline break-all"
                  >
                    {comp.url}
                  </a>
                )}
              </div>
              <Badge tone={comp.source === "scout" ? "accent" : "gray"}>{comp.source}</Badge>
            </div>
            {comp.summary && <p className="mt-2 text-sm text-ink-dim">{comp.summary}</p>}

            {plans.length > 0 && (
              <div className="mt-3">
                <div className="label-caps">Tracked pricing</div>
                <div className="flex flex-wrap gap-1.5">
                  {plans.map((p, i) => (
                    <Badge key={i}>
                      {p.plan}: {p.price}
                      {p.period}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {changes.length > 0 && (
              <div className="mt-3">
                <div className="label-caps">Recent pricing changes</div>
                <ul className="space-y-1">
                  {changes.map((s) => (
                    <li key={s.id} className="text-xs text-warn">
                      {timeAgo(s.createdAt)} — {s.changeSummary}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3 text-xs text-ink-faint">
              {counts.get(comp.id) ?? 0} complaints mined
              {latest ? ` · pricing checked ${timeAgo(latest.createdAt)}` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Leads ---------------- */

function LeadsTab({ productId }: { productId: number }) {
  const counts = db
    .select({ status: leads.status, n: sql<number>`count(*)` })
    .from(leads)
    .where(eq(leads.productId, productId))
    .groupBy(leads.status)
    .all();
  const total = counts.reduce((a, r) => a + Number(r.n), 0);
  return (
    <div className="card p-6 text-center">
      <p className="text-sm text-ink-dim">
        {total} lead{total === 1 ? "" : "s"} for this product
        {counts.length > 0 && (
          <span className="text-ink-faint">
            {" "}
            ({counts.map((r) => `${r.n} ${r.status}`).join(", ")})
          </span>
        )}
      </p>
      <Link href={`/leads?productId=${productId}`} className="btn-primary mt-4 inline-flex">
        Open the lead queue
      </Link>
    </div>
  );
}

/* ---------------- Profile ---------------- */

function ProfileTab({
  profile,
  rawInput,
}: {
  profile: {
    name: string;
    category: string;
    description: string;
    features: string[];
    persona: string;
    pricing: string;
    differentiators: string[];
  } | null;
  rawInput: string;
}) {
  if (!profile)
    return (
      <p className="text-sm text-ink-faint py-8 text-center">
        Profile not extracted yet — the pipeline builds it first.
      </p>
    );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card p-5 space-y-4">
        <Field label="Description" value={profile.description} />
        <Field label="Category" value={profile.category} />
        <Field label="Persona" value={profile.persona} />
        <Field label="Pricing" value={profile.pricing} />
        <div>
          <div className="label-caps">Features</div>
          <div className="flex flex-wrap gap-1.5">
            {profile.features.map((f) => (
              <Badge key={f}>{f}</Badge>
            ))}
          </div>
        </div>
        <div>
          <div className="label-caps">Differentiators</div>
          <div className="flex flex-wrap gap-1.5">
            {profile.differentiators.map((d) => (
              <Badge key={d} tone="accent">
                {d}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <div className="card p-5">
        <div className="label-caps">Original input</div>
        <pre className="text-xs text-ink-dim whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
          {rawInput || "—"}
        </pre>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-caps">{label}</div>
      <p className="text-sm text-ink-dim">{value || "—"}</p>
    </div>
  );
}
