"use client";

import { FileText, Globe, GitBranch, Store, ListChecks } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/ui";

const INPUT_TYPES = [
  {
    id: "markdown",
    label: "Markdown / text",
    icon: FileText,
    placeholder:
      "# MyApp\n\nMyApp is a … it helps … \n\nFeatures:\n- feature one\n- feature two\n\nPricing: $9/mo pro plan",
    hint: "Paste your README, product notes, or any description.",
  },
  {
    id: "url",
    label: "Landing page URL",
    icon: Globe,
    placeholder: "https://myapp.com",
    hint: "We fetch the page and extract the profile from it.",
  },
  {
    id: "repo",
    label: "Repo URL",
    icon: GitBranch,
    placeholder: "https://github.com/you/myapp",
    hint: "We read the README for the feature set.",
  },
  {
    id: "store",
    label: "Store listing URL",
    icon: Store,
    placeholder: "https://apps.apple.com/app/id… or Play Store / Chrome Web Store URL",
    hint: "App Store, Play Store, or Chrome Web Store listing.",
  },
  {
    id: "form",
    label: "Describe manually",
    icon: ListChecks,
    placeholder:
      "Name: MyApp\nCategory: password manager\nFeatures: autofill, breach alerts, shared vaults\nPricing: freemium, $3/mo premium\nDifferentiators: fully offline",
    hint: "A few structured lines are enough.",
  },
] as const;

export default function NewProductPage() {
  const router = useRouter();
  const [inputType, setInputType] = useState<(typeof INPUT_TYPES)[number]["id"]>("markdown");
  const [name, setName] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = INPUT_TYPES.find((t) => t.id === inputType)!;
  const isUrlInput = inputType === "url" || inputType === "repo" || inputType === "store";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Untitled product",
          inputType,
          rawInput: rawInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed to create product");
      router.push(`/products/${data.productId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Add a product"
        subtitle="The full pipeline runs automatically: profile → competitors → complaint mining → classification → leads."
      />

      <div className="card p-6 space-y-5">
        <div>
          <label className="label-caps">Product name</label>
          <input
            className="input-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Phantomshield"
          />
        </div>

        <div>
          <label className="label-caps">Input type</label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {INPUT_TYPES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setInputType(id)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-[11px] font-medium transition-colors cursor-pointer ${
                  inputType === id
                    ? "border-accent/60 bg-accent/10 text-ink"
                    : "border-border bg-surface-2 text-ink-dim hover:border-border-2"
                }`}
              >
                <Icon size={16} className={inputType === id ? "text-accent" : ""} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label-caps">
            {isUrlInput ? "URL" : "Description"}
          </label>
          {isUrlInput ? (
            <input
              className="input-base"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={selected.placeholder}
            />
          ) : (
            <textarea
              className="input-base min-h-48 font-mono text-[13px] leading-relaxed"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={selected.placeholder}
            />
          )}
          <p className="mt-1.5 text-xs text-ink-faint">{selected.hint}</p>
        </div>

        {error && <p className="text-sm text-bad">{error}</p>}

        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-faint max-w-[60%]">
            You can review and edit the extracted profile before relying on it.
          </p>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={busy || rawInput.trim().length < 4}
          >
            {busy ? "Starting pipeline…" : "Create & run pipeline"}
          </button>
        </div>
      </div>
    </div>
  );
}
