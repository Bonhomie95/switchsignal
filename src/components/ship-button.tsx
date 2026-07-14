"use client";

import { Check, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFeedback } from "./feedback";

/** "Mark shipped" on a Gap row → resurfaces old leads who asked for it. */
export function ShipButton({
  productId,
  feature,
  shipped,
}: {
  productId: number;
  feature: string;
  shipped: boolean;
}) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function ship() {
    const ok = await confirm({
      title: `Mark “${feature}” as shipped?`,
      body: "Everyone who complained about this to a competitor becomes a resurface lead: “you asked for this — we built it.” It also drops off the Gap Report.",
      confirmLabel: "Mark shipped & resurface",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${productId}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, action: "ship" }),
      });
      const data = await res.json();
      if (res.ok)
        toast(
          data.resurfaced
            ? `shipped — ${data.resurfaced} lead${data.resurfaced === 1 ? "" : "s"} resurfaced`
            : "marked shipped",
          "good",
        );
      else toast(data.error ?? "failed", "bad");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function unship() {
    setBusy(true);
    try {
      await fetch(`/api/products/${productId}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, action: "unship" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (shipped)
    return (
      <button
        className="inline-flex items-center gap-1 text-[11px] text-good hover:text-ink cursor-pointer"
        disabled={busy}
        onClick={unship}
        title="Undo shipped"
      >
        <Check size={12} /> shipped
      </button>
    );

  return (
    <button
      className="inline-flex items-center gap-1 text-[11px] text-ink-faint hover:text-accent cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
      disabled={busy}
      onClick={ship}
      title="Mark this feature as shipped and resurface old leads"
    >
      <Rocket size={12} /> ship
    </button>
  );
}
