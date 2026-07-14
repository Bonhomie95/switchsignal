"use client";

import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Badge, PageHeader, timeAgo } from "@/components/ui";

interface UsageData {
  today: { tokens: number; requests: number };
  week: { tokens: number; requests: number };
  byTag: { tag: string; tokens: number; requests: number }[];
  budget: number;
}

interface HealthRow {
  competitorName: string | null;
  source: string;
  lastRunAt: number;
  lastItemCount: number;
  consecutiveFailures: number;
  disabledUntil: number;
  lastError: string;
}

interface KeyRow {
  id: number;
  provider: "groq" | "anthropic" | "brave";
  label: string;
  masked: string;
  active: boolean;
  requestCount: number;
  lastUsedAt: number;
  pool: { inflight: number; coolingDownMs: number; disabled: boolean } | null;
}

const PROVIDERS = [
  {
    id: "groq" as const,
    title: "Groq (free tier — current engine)",
    blurb:
      "Add several keys: the pool uses them concurrently and rotates around rate limits automatically. Get free keys at console.groq.com.",
  },
  {
    id: "anthropic" as const,
    title: "Anthropic (upgrade path)",
    blurb: "Switch the provider below to Claude when you're ready — no code changes.",
  },
  {
    id: "brave" as const,
    title: "Brave Search (free tier)",
    blurb:
      "Enables evidence-backed competitor discovery and Scout scans. ~2k free queries/month at brave.com/search/api.",
  },
];

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [settings, setSettings] = useState<Record<string, string | null>>({});
  const [drafts, setDrafts] = useState<Record<string, { key: string; label: string }>>({});
  const [redditDraft, setRedditDraft] = useState({ id: "", secret: "" });
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [health, setHealth] = useState<{ connectors: HealthRow[]; now: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, confirm } = useFeedback();

  const load = useCallback(async () => {
    const [k, s, u, h] = await Promise.all([
      fetch("/api/keys", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/usage", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/health", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setKeys(k.keys);
    setSettings(s);
    setUsage(u);
    setHealth(h);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 5000); // live pool stats
    return () => clearInterval(t);
  }, [load]);

  async function addKey(provider: KeyRow["provider"]) {
    const draft = drafts[provider];
    if (!draft?.key?.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          key: draft.key.trim(),
          label: draft.label?.trim() ?? "",
        }),
      });
      if (res.ok) {
        setDrafts((d) => ({ ...d, [provider]: { key: "", label: "" } }));
        toast("key added", "good");
        await load();
      } else toast((await res.json()).error ?? "failed to add key", "bad");
    } finally {
      setBusy(false);
    }
  }

  async function deleteKey(id: number) {
    const ok = await confirm({
      title: "Remove this key?",
      body: "The pool stops using it immediately.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    await fetch("/api/keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    toast("key removed");
    await load();
  }

  async function setSetting(key: string, value: string) {
    setBusy(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      toast("saved", "good");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const provider = settings.llm_provider ?? "";
  const groqKeys = keys.filter((k) => k.provider === "groq");

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        subtitle="API keys, provider selection, and source credentials. Everything runs on free tiers."
      />

      {/* provider selection */}
      <section className="card p-5 mb-5">
        <h2 className="text-sm font-medium mb-1">Active LLM provider</h2>
        <p className="text-xs text-ink-faint mb-3">
          Auto picks Groq when keys exist, otherwise mock mode (deterministic fake output so you
          can try the whole app without any key).
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "", label: "Auto" },
            { id: "groq", label: "Groq" },
            { id: "anthropic", label: "Anthropic" },
            { id: "mock", label: "Mock (no key)" },
          ].map((p) => (
            <button
              key={p.id}
              disabled={busy}
              onClick={() => setSetting("llm_provider", p.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                provider === p.id
                  ? "border-accent/60 bg-accent/10 text-ink"
                  : "border-border text-ink-dim hover:border-border-2"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* token usage & budget */}
      {usage && (
        <section className="card p-5 mb-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">LLM token usage</h2>
            <span className="text-xs text-ink-faint">
              {usage.week.requests} requests this week
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink-dim">
                Today: <b className="text-ink tabular-nums">{fmtTokens(usage.today.tokens)}</b>
                {usage.budget > 0 && (
                  <span className="text-ink-faint"> / {fmtTokens(usage.budget)} budget</span>
                )}
              </span>
              <span className="text-xs text-ink-faint tabular-nums">
                week: {fmtTokens(usage.week.tokens)}
              </span>
            </div>
            {usage.budget > 0 && (
              <div className="mt-2 h-2 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    usage.today.tokens / usage.budget > 0.9
                      ? "bg-bad"
                      : usage.today.tokens / usage.budget > 0.7
                        ? "bg-warn"
                        : "bg-good"
                  }`}
                  style={{
                    width: `${Math.min(100, (usage.today.tokens / usage.budget) * 100)}%`,
                  }}
                />
              </div>
            )}
            {usage.byTag.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {usage.byTag.map((t) => (
                  <Badge key={t.tag}>
                    {t.tag}: {fmtTokens(t.tokens)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4">
            <div className="label-caps">Daily token budget</div>
            <p className="text-xs text-ink-faint mb-2">
              Pipelines stop starting new LLM calls when the day&apos;s budget is spent and
              resume tomorrow — so a big crawl can never exhaust your free tier.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "100000", label: "100k (cautious)" },
                { id: "500000", label: "500k (default)" },
                { id: "2000000", label: "2M (multiple keys)" },
                { id: "0", label: "Unlimited" },
              ].map((o) => (
                <button
                  key={o.id}
                  disabled={busy}
                  onClick={() => setSetting("daily_token_budget", o.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                    String(usage.budget) === o.id
                      ? "border-accent/60 bg-accent/10 text-ink"
                      : "border-border text-ink-dim hover:border-border-2"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* connector health */}
      {health && health.connectors.length > 0 && (
        <section className="card p-5 mb-5">
          <h2 className="text-sm font-medium mb-1">Connector health</h2>
          <p className="text-xs text-ink-faint mb-3">
            Per-source crawl status. Sources that fail repeatedly trip a circuit breaker and back
            off for a few hours instead of hammering a blocked host.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ink-faint">
                  <th className="py-1.5 pr-3 font-medium">Competitor</th>
                  <th className="py-1.5 pr-3 font-medium">Source</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Last items</th>
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {health.connectors.map((c, i) => {
                  const tripped = c.disabledUntil > health.now;
                  return (
                    <tr key={i} className="border-t border-border/60">
                      <td className="py-1.5 pr-3">{c.competitorName ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-ink-dim">{c.source}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{c.lastItemCount}</td>
                      <td className="py-1.5 pr-3">
                        {tripped ? (
                          <Badge tone="bad">
                            backing off {Math.ceil((c.disabledUntil - health.now) / 3600_000)}h
                          </Badge>
                        ) : c.consecutiveFailures > 0 ? (
                          <Badge tone="warn">{c.consecutiveFailures} recent fail(s)</Badge>
                        ) : (
                          <Badge tone="good">ok · {timeAgo(c.lastRunAt || null)}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* auto refresh */}
      <section className="card p-5 mb-5">
        <h2 className="text-sm font-medium mb-1">Automatic re-crawls</h2>
        <p className="text-xs text-ink-faint mb-3">
          While the app is running, every ready product re-mines sources, classifies new
          posts, refreshes leads, and checks competitor pricing on this schedule.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "0", label: "Off (manual only)" },
            { id: "6", label: "Every 6h" },
            { id: "12", label: "Every 12h" },
            { id: "24", label: "Daily" },
            { id: "48", label: "Every 2 days" },
          ].map((o) => (
            <button
              key={o.id}
              disabled={busy}
              onClick={() => setSetting("auto_refresh_hours", o.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                (settings.auto_refresh_hours ?? "0") === o.id
                  ? "border-accent/60 bg-accent/10 text-ink"
                  : "border-border text-ink-dim hover:border-border-2"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      {/* api keys per provider */}
      {PROVIDERS.map((p) => {
        const rows = keys.filter((k) => k.provider === p.id);
        const draft = drafts[p.id] ?? { key: "", label: "" };
        return (
          <section key={p.id} className="card p-5 mb-5">
            <div className="flex items-center gap-2">
              <KeyRound size={15} className="text-ink-faint" />
              <h2 className="text-sm font-medium">{p.title}</h2>
              {p.id === "groq" && groqKeys.length > 1 && (
                <Badge tone="accent">{groqKeys.length}-key concurrent pool</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-faint">{p.blurb}</p>

            {rows.length > 0 && (
              <ul className="mt-4 space-y-2">
                {rows.map((k) => (
                  <li
                    key={k.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
                  >
                    <code className="font-mono text-xs">{k.masked}</code>
                    {k.label && <span className="text-ink-dim text-xs">{k.label}</span>}
                    {!k.active && <Badge tone="bad">disabled (rejected)</Badge>}
                    {k.pool && k.pool.coolingDownMs > 0 && (
                      <Badge tone="warn">
                        cooling {Math.ceil(k.pool.coolingDownMs / 1000)}s
                      </Badge>
                    )}
                    {k.pool && k.pool.inflight > 0 && (
                      <Badge tone="accent">{k.pool.inflight} in flight</Badge>
                    )}
                    <span className="ml-auto text-xs text-ink-faint tabular-nums">
                      {k.requestCount} reqs · used {timeAgo(k.lastUsedAt || null)}
                    </span>
                    <button
                      className="text-ink-faint hover:text-bad transition-colors cursor-pointer"
                      onClick={() => deleteKey(k.id)}
                      title="Remove key"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex gap-2">
              <input
                className="input-base font-mono text-xs"
                placeholder={`${p.id} API key`}
                value={draft.key}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [p.id]: { ...draft, key: e.target.value } }))
                }
              />
              <input
                className="input-base max-w-32"
                placeholder="label"
                value={draft.label}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [p.id]: { ...draft, label: e.target.value } }))
                }
              />
              <button
                className="btn-ghost shrink-0"
                disabled={busy || !draft.key.trim()}
                onClick={() => addKey(p.id)}
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </section>
        );
      })}

      {/* reddit credentials */}
      <section className="card p-5 mb-5">
        <h2 className="text-sm font-medium">Reddit API (free)</h2>
        <p className="mt-1 text-xs text-ink-faint">
          Reddit blocks anonymous scraping. Create a free “script” app at{" "}
          <a
            href="https://www.reddit.com/prefs/apps"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            reddit.com/prefs/apps
          </a>{" "}
          and paste the credentials here to unlock the highest-intent complaint source.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={settings.reddit_client_id ? "good" : "gray"}>
            client id {settings.reddit_client_id ? "set" : "missing"}
          </Badge>
          <Badge tone={settings.reddit_client_secret ? "good" : "gray"}>
            secret {settings.reddit_client_secret ? "set" : "missing"}
          </Badge>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="input-base font-mono text-xs"
            placeholder="client id"
            value={redditDraft.id}
            onChange={(e) => setRedditDraft((d) => ({ ...d, id: e.target.value }))}
          />
          <input
            className="input-base font-mono text-xs"
            placeholder="client secret"
            type="password"
            value={redditDraft.secret}
            onChange={(e) => setRedditDraft((d) => ({ ...d, secret: e.target.value }))}
          />
          <button
            className="btn-ghost shrink-0"
            disabled={busy || !redditDraft.id.trim() || !redditDraft.secret.trim()}
            onClick={async () => {
              await setSetting("reddit_client_id", redditDraft.id.trim());
              await setSetting("reddit_client_secret", redditDraft.secret.trim());
              setRedditDraft({ id: "", secret: "" });
            }}
          >
            Save
          </button>
        </div>
      </section>

      {/* outreach handles for reply tracking */}
      <section className="card p-5 mb-5">
        <h2 className="text-sm font-medium">Your outreach handles</h2>
        <p className="mt-1 text-xs text-ink-faint">
          After you post an approved reply and mark it “sent”, SwitchSignal polls the thread to
          see if the complainer responded and auto-advances the lead to “replied”. Enter the
          usernames you post under.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label-caps">Reddit username</label>
            <input
              className="input-base"
              placeholder="u/yourhandle (without u/)"
              defaultValue={settings.reddit_username ?? ""}
              onBlur={(e) =>
                e.target.value.trim() !== (settings.reddit_username ?? "") &&
                setSetting("reddit_username", e.target.value.trim())
              }
            />
          </div>
          <div>
            <label className="label-caps">Hacker News username</label>
            <input
              className="input-base"
              placeholder="yourhandle"
              defaultValue={settings.hn_username ?? ""}
              onBlur={(e) =>
                e.target.value.trim() !== (settings.hn_username ?? "") &&
                setSetting("hn_username", e.target.value.trim())
              }
            />
          </div>
        </div>
      </section>

      <p className="text-xs text-ink-faint leading-relaxed px-1">
        Keys are stored locally in <code className="font-mono">data/switchsignal.db</code> and
        never leave your machine except to call the provider itself. Env vars{" "}
        <code className="font-mono">GROQ_API_KEYS</code> (comma-separated),{" "}
        <code className="font-mono">ANTHROPIC_API_KEY</code>,{" "}
        <code className="font-mono">BRAVE_API_KEY</code>,{" "}
        <code className="font-mono">REDDIT_CLIENT_ID/SECRET</code> also work.
      </p>
    </div>
  );
}
