"use client";

import { Telescope } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const SUGGESTIONS = [
  "AI writing assistant",
  "screenshot & screen recording",
  "email warmup",
  "social media scheduler",
  "invoice generator for freelancers",
  "uptime monitoring",
];

export function ScoutForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(q: string) {
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "scan failed to start");
      setQuery("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex gap-2">
        <input
          className="input-base"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit(query)}
          placeholder='Category or keyword — e.g. "AI writing assistant", or anything trendy'
        />
        <button
          className="btn-primary shrink-0"
          disabled={busy || query.trim().length < 2}
          onClick={() => submit(query)}
        >
          <Telescope size={15} /> {busy ? "Starting…" : "Scan"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => submit(s)}
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-ink-dim hover:text-ink hover:border-border-2 transition-colors cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}
