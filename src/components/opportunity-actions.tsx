"use client";

import { Check, Rocket, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFeedback } from "./feedback";

export function OpportunityActions({
  id,
  status,
}: {
  id: number;
  status: string;
}) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function act(action: string) {
    if (action === "adopt") {
      const ok = await confirm({
        title: "Adopt this opportunity?",
        body: "Creates a Compete-mode product seeded with this target as competitor #1 and runs the full pipeline immediately.",
        confirmLabel: "Adopt & run pipeline",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/opportunities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (action === "adopt" && data.productId) {
        toast("opportunity adopted — pipeline running", "good");
        router.push(`/products/${data.productId}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status === "adopted")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-good">
        <Check size={13} /> adopted
      </span>
    );

  return (
    <div className="flex items-center gap-1.5">
      {status !== "shortlisted" && status !== "dismissed" && (
        <button className="btn-ghost !px-2.5 !py-1.5 text-xs" disabled={busy} onClick={() => act("shortlist")} title="Shortlist">
          <Star size={13} />
        </button>
      )}
      {status !== "dismissed" ? (
        <button className="btn-ghost !px-2.5 !py-1.5 text-xs" disabled={busy} onClick={() => act("dismiss")} title="Dismiss">
          <X size={13} />
        </button>
      ) : (
        <button className="btn-ghost !px-2.5 !py-1.5 text-xs" disabled={busy} onClick={() => act("restore")}>
          restore
        </button>
      )}
      <button className="btn-primary !px-2.5 !py-1.5 text-xs" disabled={busy} onClick={() => act("adopt")} title="Build this — hand off to Compete mode">
        <Rocket size={13} /> Adopt
      </button>
    </div>
  );
}
