import { desc, eq } from "drizzle-orm";
import { db, jobs } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream of recent jobs. Pushes a snapshot whenever
 * anything changes, so the dashboard updates without polling. The client
 * falls back to polling if EventSource fails.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 8), 50);

  const snapshot = () => {
    const rows = productId
      ? db.select().from(jobs).where(eq(jobs.productId, Number(productId))).orderBy(desc(jobs.id)).limit(limit).all()
      : db.select().from(jobs).orderBy(desc(jobs.id)).limit(limit).all();
    return rows;
  };

  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      let lastPayload = "";
      const push = () => {
        if (closed) return;
        try {
          const rows = snapshot();
          const payload = JSON.stringify(rows);
          if (payload !== lastPayload) {
            lastPayload = payload;
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          } else {
            // heartbeat comment keeps the connection alive through proxies
            controller.enqueue(encoder.encode(`: ping\n\n`));
          }
        } catch {
          /* controller closed */
        }
      };
      push();
      timer = setInterval(push, 1500);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  req.signal.addEventListener("abort", () => {
    closed = true;
    if (timer) clearInterval(timer);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
