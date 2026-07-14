/**
 * Concurrent multi-key pool.
 *
 * Multiple API keys are used simultaneously: each key allows up to
 * `perKeyConcurrency` in-flight requests, so total throughput scales with the
 * number of keys. A key that hits a rate limit (429) is put on cooldown and
 * traffic shifts to the remaining keys. A key rejected as unauthorized (401)
 * is disabled and reported via `onDisabled`.
 */
export interface PoolKey {
  id: number | string;
  key: string;
}

interface KeyState {
  id: number | string;
  key: string;
  inflight: number;
  cooldownUntil: number;
  disabled: boolean;
  requestCount: number;
}

export interface KeyPoolOptions {
  perKeyConcurrency?: number;
  /** default cooldown ms after 429 when no retry-after given */
  defaultCooldownMs?: number;
  /** called when a key is disabled (401) so callers can persist it */
  onDisabled?: (id: number | string) => void;
  /** called after each successful use, for usage persistence */
  onUsed?: (id: number | string, requestCount: number) => void;
  now?: () => number;
}

export class NoKeysError extends Error {
  constructor() {
    super("No active API keys available in the pool");
    this.name = "NoKeysError";
  }
}

export class KeyPool {
  private states: KeyState[] = [];
  private waiters: (() => void)[] = [];
  private readonly perKeyConcurrency: number;
  private readonly defaultCooldownMs: number;
  private readonly onDisabled?: (id: number | string) => void;
  private readonly onUsed?: (id: number | string, count: number) => void;
  private readonly now: () => number;

  constructor(keys: PoolKey[], opts: KeyPoolOptions = {}) {
    this.perKeyConcurrency = opts.perKeyConcurrency ?? 4;
    this.defaultCooldownMs = opts.defaultCooldownMs ?? 20_000;
    this.onDisabled = opts.onDisabled;
    this.onUsed = opts.onUsed;
    this.now = opts.now ?? Date.now;
    this.setKeys(keys);
  }

  /** Replace the key set (e.g., after the user edits keys in Settings). */
  setKeys(keys: PoolKey[]) {
    const prev = new Map(this.states.map((s) => [String(s.id), s]));
    this.states = keys.map((k) => {
      const old = prev.get(String(k.id));
      return {
        id: k.id,
        key: k.key,
        inflight: old?.inflight ?? 0,
        cooldownUntil: old?.cooldownUntil ?? 0,
        disabled: false,
        requestCount: old?.requestCount ?? 0,
      };
    });
    this.wakeAll();
  }

  get size() {
    return this.states.filter((s) => !s.disabled).length;
  }

  private available(): KeyState[] {
    const t = this.now();
    return this.states.filter(
      (s) =>
        !s.disabled &&
        s.cooldownUntil <= t &&
        s.inflight < this.perKeyConcurrency,
    );
  }

  private wakeAll() {
    const ws = this.waiters;
    this.waiters = [];
    for (const w of ws) w();
  }

  /**
   * Acquire a key slot. Resolves with the key and a release/report handle.
   * Prefers the key with the fewest in-flight requests (spread load), then
   * least-recently-used. Waits if every key is busy or cooling down.
   */
  async acquire(): Promise<{
    id: number | string;
    key: string;
    release: () => void;
    reportRateLimit: (retryAfterMs?: number) => void;
    reportUnauthorized: () => void;
  }> {
    for (;;) {
      if (this.states.every((s) => s.disabled)) throw new NoKeysError();
      const avail = this.available();
      if (avail.length > 0) {
        avail.sort((a, b) => a.inflight - b.inflight);
        const s = avail[0];
        s.inflight++;
        let done = false;
        return {
          id: s.id,
          key: s.key,
          release: () => {
            if (done) return;
            done = true;
            s.inflight--;
            s.requestCount++;
            this.onUsed?.(s.id, s.requestCount);
            this.wakeAll();
          },
          reportRateLimit: (retryAfterMs) => {
            s.cooldownUntil =
              this.now() + (retryAfterMs ?? this.defaultCooldownMs);
            if (!done) {
              done = true;
              s.inflight--;
            }
            this.wakeAll();
          },
          reportUnauthorized: () => {
            s.disabled = true;
            if (!done) {
              done = true;
              s.inflight--;
            }
            this.onDisabled?.(s.id);
            this.wakeAll();
          },
        };
      }
      // Nothing available: wait for a release/wake or the nearest cooldown end.
      const t = this.now();
      const nextCooldown = Math.min(
        ...this.states
          .filter((s) => !s.disabled && s.cooldownUntil > t)
          .map((s) => s.cooldownUntil - t),
        60_000,
      );
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.max(nextCooldown, 50));
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  /** Snapshot for the dashboard/settings page. */
  stats() {
    const t = this.now();
    return this.states.map((s) => ({
      id: s.id,
      inflight: s.inflight,
      coolingDownMs: Math.max(0, s.cooldownUntil - t),
      disabled: s.disabled,
      requestCount: s.requestCount,
    }));
  }
}
