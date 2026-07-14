/** Server-renderable stacked weekly complaint chart — pure CSS, no chart lib. */

const CATEGORY_COLORS: Record<string, string> = {
  pricing: "#fbbf24",
  missing_feature: "#7c6cf6",
  bug_reliability: "#f87171",
  ux: "#38bdf8",
  support: "#fb923c",
  performance: "#34d399",
  privacy: "#a78bfa",
  lock_in: "#f472b6",
  other: "#6b7284",
};

export interface WeekBucket {
  label: string; // e.g. "Jun 22"
  total: number;
  byCategory: Record<string, number>;
}

export function bucketByWeek(
  rows: { postedAt: number | null; createdAt: number; category: string | null }[],
  weeks = 8,
): WeekBucket[] {
  const week = 7 * 86_400_000;
  const now = Date.now();
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => {
    const start = now - (weeks - i) * week;
    return {
      label: new Date(start).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      total: 0,
      byCategory: {},
    };
  });
  for (const r of rows) {
    const t = r.postedAt ?? r.createdAt;
    const idx = Math.floor((t - (now - weeks * week)) / week);
    if (idx < 0 || idx >= weeks) continue;
    const cat = r.category ?? "other";
    buckets[idx].total++;
    buckets[idx].byCategory[cat] = (buckets[idx].byCategory[cat] ?? 0) + 1;
  }
  return buckets;
}

export function TrendChart({ buckets }: { buckets: WeekBucket[] }) {
  const max = Math.max(...buckets.map((b) => b.total), 1);
  const legendCats = [
    ...new Set(buckets.flatMap((b) => Object.keys(b.byCategory))),
  ].slice(0, 6);

  return (
    <div>
      <div className="flex gap-2">
        {buckets.map((b, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <div className="h-28 w-full flex flex-col justify-end items-center">
              <div
                className="w-full max-w-10 flex flex-col-reverse rounded-t overflow-hidden"
                style={{
                  height: `${Math.max((b.total / max) * 100, b.total ? 6 : 0)}%`,
                }}
                title={`${b.total} complaints week of ${b.label}`}
              >
                {Object.entries(b.byCategory).map(([cat, n]) => (
                  <div
                    key={cat}
                    style={{
                      height: `${(n / Math.max(b.total, 1)) * 100}%`,
                      background: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.other,
                    }}
                  />
                ))}
              </div>
            </div>
            <span className="text-[10px] text-ink-faint whitespace-nowrap">{b.label}</span>
            <span className="text-[10px] tabular-nums text-ink-dim -mt-1">
              {b.total || ""}
            </span>
          </div>
        ))}
      </div>
      {legendCats.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {legendCats.map((cat) => (
            <span key={cat} className="inline-flex items-center gap-1.5 text-[11px] text-ink-dim">
              <span
                className="size-2 rounded-sm"
                style={{ background: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.other }}
              />
              {cat.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
