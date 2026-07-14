"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

/* ---------------- toasts ---------------- */

interface Toast {
  id: number;
  message: string;
  tone: "default" | "good" | "bad";
}

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackContextValue {
  toast: (message: string, tone?: Toast["tone"]) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: Toast["tone"] = "default") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setDialog(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* toast stack */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg border px-3.5 py-2.5 text-sm shadow-lg backdrop-blur bg-surface/95 ${
              t.tone === "good"
                ? "border-good/40 text-good"
                : t.tone === "bad"
                  ? "border-bad/40 text-bad"
                  : "border-border-2 text-ink"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* confirm dialog */}
      {dialog && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => settle(false)}
        >
          <div
            className="card w-full max-w-sm p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h2 className="font-medium">{dialog.title}</h2>
            {dialog.body && <p className="mt-2 text-sm text-ink-dim">{dialog.body}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => settle(false)} autoFocus>
                Cancel
              </button>
              <button
                className={dialog.danger ? "btn-danger" : "btn-primary"}
                onClick={() => settle(true)}
              >
                {dialog.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
