"use client";

import { ListRestart, Play, RefreshCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFeedback } from "./feedback";

export function ProductActions({
  productId,
  hasProfile,
}: {
  productId: number;
  hasProfile: boolean;
}) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(type: string, label: string) {
    setBusy(type);
    try {
      const res = await fetch(`/api/products/${productId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (res.ok) toast(`${label} queued`, "good");
      else toast(`failed to queue ${label}`, "bad");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete this product?",
      body: "Its competitors, complaints, and leads are removed permanently.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy("delete");
    await fetch(`/api/products/${productId}`, { method: "DELETE" });
    toast("product deleted");
    router.push("/products");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {hasProfile && (
        <>
          <button
            className="btn-ghost"
            disabled={busy !== null}
            onClick={() => run("refresh_data", "data refresh")}
            title="Re-mine sources, classify new posts, refresh leads, check pricing"
          >
            <RefreshCcw size={14} /> Refresh data
          </button>
          <button
            className="btn-ghost !px-2.5"
            disabled={busy !== null}
            onClick={() => run("reclassify_skipped", "reclassification")}
            title="Retry posts whose classification previously failed"
          >
            <ListRestart size={14} />
          </button>
        </>
      )}
      <button
        className="btn-primary"
        disabled={busy !== null}
        onClick={() => run("full_pipeline", "full pipeline")}
        title="Run the whole pipeline from profiling onward"
      >
        <Play size={14} /> {busy ? "Queued…" : "Run full pipeline"}
      </button>
      <button className="btn-danger" disabled={busy !== null} onClick={remove}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
