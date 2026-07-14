"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Full-text search box for the complaints tab (FTS5-backed). */
export function ComplaintSearch({
  productId,
  initialQuery,
}: {
  productId: number;
  initialQuery: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  function submit(q: string) {
    const base = `/products/${productId}?tab=complaints`;
    router.push(q.trim() ? `${base}&q=${encodeURIComponent(q.trim())}` : base);
  }

  return (
    <div className="relative">
      <Search
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
      />
      <input
        className="input-base pl-9 pr-9"
        placeholder="Search complaints — e.g. “data loss”, “refund”, “slow sync”…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit(value)}
      />
      {value && (
        <button
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink cursor-pointer"
          onClick={() => {
            setValue("");
            submit("");
          }}
          aria-label="Clear search"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
