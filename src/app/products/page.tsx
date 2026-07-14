import { desc, eq, sql } from "drizzle-orm";
import { Package, Plus } from "lucide-react";
import Link from "next/link";
import { competitors, complaints, db, leads, products } from "@/db";
import { Badge, EmptyState, PageHeader, statusTone, timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ProductsPage() {
  const rows = db.select().from(products).orderBy(desc(products.id)).all();

  const stats = new Map(
    rows.map((p) => {
      const comps =
        db
          .select({ n: sql<number>`count(*)` })
          .from(competitors)
          .where(eq(competitors.productId, p.id))
          .get()?.n ?? 0;
      const compls =
        db
          .select({ n: sql<number>`count(*)` })
          .from(complaints)
          .where(
            sql`${complaints.productId} = ${p.id} and ${complaints.status} = 'classified' and ${complaints.category} != 'not_a_complaint'`,
          )
          .get()?.n ?? 0;
      const leadN =
        db
          .select({ n: sql<number>`count(*)` })
          .from(leads)
          .where(eq(leads.productId, p.id))
          .get()?.n ?? 0;
      return [p.id, { comps, compls, leadN }] as const;
    }),
  );

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Each product gets its own competitor set, complaint mining, and lead queue."
        actions={
          <Link href="/products/new" className="btn-primary">
            <Plus size={15} /> Add product
          </Link>
        }
      />
      {!rows.length ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          body="Describe your app with markdown, a landing-page URL, or a repo link — the pipeline handles the rest."
          action={
            <Link href="/products/new" className="btn-primary">
              <Plus size={15} /> Add your first product
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const s = stats.get(p.id)!;
            return (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                className="card p-5 hover:border-border-2 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium truncate">{p.name}</h3>
                  <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-semibold tabular-nums">{s.comps}</div>
                    <div className="text-[11px] text-ink-faint">competitors</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold tabular-nums">{s.compls}</div>
                    <div className="text-[11px] text-ink-faint">complaints</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold tabular-nums">{s.leadN}</div>
                    <div className="text-[11px] text-ink-faint">leads</div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-ink-faint">
                  updated {timeAgo(p.updatedAt)}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
