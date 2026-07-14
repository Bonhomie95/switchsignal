"use client";

import {
  Home,
  Menu,
  Package,
  Radar,
  Send,
  Settings,
  Telescope,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/products", label: "Products", icon: Package },
  { href: "/scout", label: "Scout", icon: Telescope },
  { href: "/leads", label: "Leads", icon: Send },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // close the drawer on navigation
  useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-accent/15 text-ink font-medium"
                : "text-ink-dim hover:text-ink hover:bg-surface-2"
            }`}
          >
            <Icon size={16} className={active ? "text-accent" : ""} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 px-5 h-16 border-b border-border shrink-0">
      <span className="grid place-items-center size-8 rounded-lg bg-accent/20 text-accent">
        <Radar size={18} />
      </span>
      <span className="font-semibold tracking-tight">SwitchSignal</span>
    </Link>
  );

  return (
    <>
      {/* mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center gap-3 h-12 px-3 border-b border-border bg-surface/90 backdrop-blur">
        <button
          className="grid place-items-center size-9 rounded-lg text-ink-dim hover:text-ink cursor-pointer"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid place-items-center size-6 rounded-md bg-accent/20 text-accent">
            <Radar size={13} />
          </span>
          SwitchSignal
        </Link>
      </div>

      {/* mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60" onClick={() => setOpen(false)}>
          <aside
            className="h-full w-64 bg-surface border-r border-border flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button
                className="grid place-items-center size-9 rounded-lg text-ink-dim hover:text-ink cursor-pointer"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
              >
                <X size={17} />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      {/* desktop sidebar */}
      <aside className="hidden lg:flex sticky top-0 h-screen w-56 shrink-0 border-r border-border bg-surface/50 backdrop-blur flex-col">
        {brand}
        {nav}
        <div className="px-5 py-4 border-t border-border text-[11px] leading-relaxed text-ink-faint">
          Compete &amp; Scout modes
          <br />
          $0-budget build · Groq-powered
        </div>
      </aside>
    </>
  );
}
