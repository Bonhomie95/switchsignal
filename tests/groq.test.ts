import { describe, expect, it } from "vitest";
import { GroqProvider } from "@/lib/llm/groq";

function ok(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("GroqProvider", () => {
  it("returns the completion content", async () => {
    const provider = new GroqProvider([{ id: 1, key: "sk-a" }], {
      fetchFn: async () => ok("hello"),
    });
    expect(
      await provider.complete({ tag: "generic", prompt: "hi" }),
    ).toBe("hello");
  });

  it("rotates to another key after a 429", async () => {
    const used: string[] = [];
    const provider = new GroqProvider(
      [
        { id: 1, key: "sk-a" },
        { id: 2, key: "sk-b" },
      ],
      {
        fetchFn: async (_url, init) => {
          const auth = String(
            (init?.headers as Record<string, string>)?.Authorization,
          );
          used.push(auth);
          // first key always rate-limited, second succeeds
          if (auth.includes("sk-a"))
            return new Response("rate limited", { status: 429 });
          return ok("via-b");
        },
      },
    );
    const out = await provider.complete({ tag: "generic", prompt: "x" });
    expect(out).toBe("via-b");
    expect(used.some((u) => u.includes("sk-b"))).toBe(true);
  });

  it("disables a rejected key (401) and succeeds with the other", async () => {
    const provider = new GroqProvider(
      [
        { id: 1, key: "sk-bad" },
        { id: 2, key: "sk-good" },
      ],
      {
        fetchFn: async (_url, init) => {
          const auth = String(
            (init?.headers as Record<string, string>)?.Authorization,
          );
          if (auth.includes("sk-bad"))
            return new Response("unauthorized", { status: 401 });
          return ok("fine");
        },
      },
    );
    // run twice — after the first call sk-bad is out of rotation entirely
    expect(await provider.complete({ tag: "generic", prompt: "1" })).toBe("fine");
    expect(await provider.complete({ tag: "generic", prompt: "2" })).toBe("fine");
    expect(provider.pool.size).toBe(1);
  });

  it("fails with a clear error when every key is invalid", async () => {
    const provider = new GroqProvider([{ id: 1, key: "sk-bad" }], {
      fetchFn: async () => new Response("no", { status: 401 }),
    });
    await expect(
      provider.complete({ tag: "generic", prompt: "x" }),
    ).rejects.toThrow(/keys are disabled|rejected/i);
  });

  it("does not retry non-retryable 4xx errors", async () => {
    let calls = 0;
    const provider = new GroqProvider([{ id: 1, key: "sk-a" }], {
      fetchFn: async () => {
        calls++;
        return new Response("bad request", { status: 400 });
      },
    });
    await expect(
      provider.complete({ tag: "generic", prompt: "x" }),
    ).rejects.toThrow(/400/);
    expect(calls).toBe(1);
  });

  it("runs many requests concurrently across the pool", async () => {
    let inflight = 0;
    let peak = 0;
    const provider = new GroqProvider(
      [
        { id: 1, key: "sk-a" },
        { id: 2, key: "sk-b" },
        { id: 3, key: "sk-c" },
      ],
      {
        fetchFn: async () => {
          inflight++;
          peak = Math.max(peak, inflight);
          await new Promise((r) => setTimeout(r, 20));
          inflight--;
          return ok("done");
        },
      },
    );
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        provider.complete({ tag: "generic", prompt: `p${i}` }),
      ),
    );
    expect(results).toHaveLength(12);
    expect(results.every((r) => r === "done")).toBe(true);
    // 3 keys × perKeyConcurrency 4 = 12 possible; we should clearly exceed serial
    expect(peak).toBeGreaterThan(3);
  });
});
