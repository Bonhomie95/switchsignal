import { describe, expect, it } from "vitest";
import { KeyPool, NoKeysError } from "@/lib/llm/keypool";

const keys = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, key: `sk-${i + 1}` }));

describe("KeyPool", () => {
  it("spreads concurrent acquisitions across keys", async () => {
    const pool = new KeyPool(keys(3), { perKeyConcurrency: 2 });
    const slots = await Promise.all([
      pool.acquire(),
      pool.acquire(),
      pool.acquire(),
    ]);
    // 3 acquisitions over 3 keys with least-inflight preference → all distinct
    expect(new Set(slots.map((s) => s.id)).size).toBe(3);
    slots.forEach((s) => s.release());
  });

  it("allows up to perKeyConcurrency in-flight per key", async () => {
    const pool = new KeyPool(keys(2), { perKeyConcurrency: 3 });
    const slots = await Promise.all(
      Array.from({ length: 6 }, () => pool.acquire()),
    );
    const byKey = new Map<string | number, number>();
    for (const s of slots) byKey.set(s.id, (byKey.get(s.id) ?? 0) + 1);
    expect([...byKey.values()].every((n) => n <= 3)).toBe(true);
    expect(slots.length).toBe(6);
    slots.forEach((s) => s.release());
  });

  it("routes traffic away from a rate-limited key", async () => {
    let now = 1000;
    const pool = new KeyPool(keys(2), {
      perKeyConcurrency: 1,
      defaultCooldownMs: 5000,
      now: () => now,
    });
    const a = await pool.acquire();
    a.reportRateLimit(); // key A cools down 5s
    const b = await pool.acquire();
    expect(b.id).not.toBe(a.id);
    b.release();
    // still cooling: same key again
    const c = await pool.acquire();
    expect(c.id).toBe(b.id);
    c.release();
    // after cooldown expires the key returns to rotation
    now += 6000;
    const d = await pool.acquire();
    const e = await pool.acquire();
    expect(new Set([d.id, e.id]).size).toBe(2);
    d.release();
    e.release();
  });

  it("waits for a release when everything is busy, then proceeds", async () => {
    const pool = new KeyPool(keys(1), { perKeyConcurrency: 1 });
    const first = await pool.acquire();
    let resolved = false;
    const second = pool.acquire().then((s) => {
      resolved = true;
      return s;
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(resolved).toBe(false);
    first.release();
    const s2 = await second;
    expect(resolved).toBe(true);
    s2.release();
  });

  it("disables a key on 401 and reports it", async () => {
    const disabled: (number | string)[] = [];
    const pool = new KeyPool(keys(2), { onDisabled: (id) => disabled.push(id) });
    const a = await pool.acquire();
    a.reportUnauthorized();
    expect(disabled).toEqual([a.id]);
    expect(pool.size).toBe(1);
    // remaining key still serves
    const b = await pool.acquire();
    expect(b.id).not.toBe(a.id);
    b.release();
  });

  it("throws NoKeysError when every key is disabled", async () => {
    const pool = new KeyPool(keys(1));
    const a = await pool.acquire();
    a.reportUnauthorized();
    await expect(pool.acquire()).rejects.toThrow(NoKeysError);
  });

  it("counts usage per key via onUsed", async () => {
    const counts: Record<string, number> = {};
    const pool = new KeyPool(keys(1), {
      onUsed: (id, c) => (counts[String(id)] = c),
    });
    for (let i = 0; i < 3; i++) (await pool.acquire()).release();
    expect(counts["1"]).toBe(3);
  });
});
