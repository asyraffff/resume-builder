"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { USAGE_LABELS, type Usage, type UsageRoute } from "@/lib/usage";

/**
 * The visitor's remaining AI allowance: a header chip with a breakdown, a heads-up beside AI buttons when
 * running low, and a calm card (instead of an error) once a limit is reached. Numbers come from /api/usage and
 * from limit responses; they're approximate when the host runs several server instances.
 */

type Snapshot = { usage: Usage; at: number };

let snapshot: Snapshot | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export function setUsage(usage: Usage) {
  snapshot = { usage, at: Date.now() };
  listeners.forEach((l) => l());
  scheduleRefresh(usage);
}

let inFlight: Promise<void> | null = null;
export function refreshUsage(): Promise<void> {
  inFlight ??= fetch("/api/usage", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<Usage>) : null))
    .then((u) => {
      if (u) setUsage(u);
    })
    .catch(() => {
      /* the meter just stays as it was */
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Re-check when the next request frees up, so a "come back at…" card clears itself on time. */
function scheduleRefresh(usage: Usage) {
  clearTimeout(refreshTimer);
  const waits = Object.values(usage.routes)
    .filter((r) => r.remaining < r.limit && r.nextFreeInSec !== null)
    .map((r) => r.nextFreeInSec!);
  if (usage.busy) waits.push(usage.busy.resetInSec);
  if (!waits.length) return;
  const sec = Math.min(...waits);
  if (sec > 6 * 3600) return; // far off: the next page load or AI call will refresh it
  refreshTimer = setTimeout(() => void refreshUsage(), Math.max(5, sec + 1) * 1000);
}

/** The latest snapshot, re-rendered every 30 seconds so "in 8 min" stays current. */
function useUsage() {
  const snap = useSyncExternalStore(subscribe, () => snapshot, () => null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return { snap, now };
}

/** Absolute time at which `sec` (measured when the snapshot arrived) runs out. */
const atTime = (snap: Snapshot, sec: number) => snap.at + sec * 1000;

function relative(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return `${h} hour${h > 1 ? "s" : ""}`;
}
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const plural = (route: UsageRoute, n: number) => `${n} ${n === 1 ? USAGE_LABELS[route].one : USAGE_LABELS[route].many}`;

/** "Low" means a quarter or less of the current window is left (at least the last one). */
const isLow = (remaining: number, limit: number) => remaining > 0 && remaining <= Math.max(1, Math.floor(limit / 4));

const ORDER: UsageRoute[] = ["match", "parse-jd", "parse-resume"];

/** 1 · Header chip: matches left (the scarcest action), with a breakdown on click. */
export function UsageChip() {
  const { snap, now } = useUsage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!snapshot) void refreshUsage();
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!snap) return null;
  const { routes, busy } = snap.usage;
  const m = routes.match;
  const tone = busy || m.remaining === 0 ? "text-bad border-red-200" : isLow(m.remaining, m.limit) ? "text-warn border-amber-200" : "text-muted border-border";
  const label = busy ? "AI paused" : m.remaining === 0 ? "No matches left" : `${plural("match", m.remaining)} left`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs hover:bg-background ${tone}`}
        title="Your AI usage"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11" />
        </svg>
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{busy ? "Paused" : m.remaining}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Your AI usage" className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-border bg-surface p-4 text-sm shadow-lg">
          <p className="font-medium">Your AI usage</p>
          {busy ? (
            <p className="mt-2 text-muted">
              The app has reached its daily AI limit for everyone. It&apos;ll be back around {clock(atTime(snap, busy.resetInSec))}. You can keep
              editing and exporting meanwhile.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {ORDER.map((route) => {
                const r = routes[route];
                const pct = Math.round((r.remaining / r.limit) * 100);
                const bar = r.remaining === 0 ? "bg-bad" : isLow(r.remaining, r.limit) ? "bg-warn" : "bg-accent";
                return (
                  <li key={route}>
                    <div className="flex justify-between gap-3">
                      <span className="first-letter:uppercase">{USAGE_LABELS[route].many}</span>
                      <span className="tabular-nums text-muted">
                        {r.remaining} of {r.limit} left
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-background" aria-hidden>
                      <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                    </div>
                    {r.remaining < r.limit && r.nextFreeInSec !== null && (
                      <p className="mt-1 text-xs text-muted">Next one frees up in {relative(atTime(snap, r.nextFreeInSec) - now)}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
            Limits refill gradually over 10 minutes, up to a daily cap ({routes.match.daily} matches a day). Editing and exporting are
            always unlimited.
          </p>
        </div>
      )}
    </div>
  );
}

/** 2 · A heads-up beside an AI button, shown only when running low. */
export function UsageHint({ route, className = "" }: { route: UsageRoute; className?: string }) {
  const { snap, now } = useUsage();
  if (!snap || snap.usage.busy) return null;
  const r = snap.usage.routes[route];
  if (!isLow(r.remaining, r.limit)) return null;
  const more = r.nextFreeInSec !== null ? `, more in ${relative(atTime(snap, r.nextFreeInSec) - now)}` : "";
  return (
    <span className={`text-xs text-warn ${className}`} role="status">
      {plural(route, r.remaining)} left{more}
    </span>
  );
}

/** 3 · Shown in place of an error once a limit is reached; clears itself when the allowance refills. */
export function LimitCard({ route, className = "" }: { route: UsageRoute; className?: string }) {
  const { snap, now } = useUsage();
  if (!snap) return null;
  const { busy } = snap.usage;
  const r = snap.usage.routes[route];
  if (!busy && r.remaining > 0) return null;

  const sec = busy ? busy.resetInSec : r.nextFreeInSec;
  const when = sec === null ? null : atTime(snap, sec);
  const title = busy ? "AI features are paused for today" : `You've used your ${USAGE_LABELS[route].many} for now`;
  const back =
    when === null
      ? "Try again a little later."
      : busy
        ? `They'll be back around ${clock(when)} (in ${relative(when - now)}).`
        : `You can ${USAGE_LABELS[route].verb} again at ${clock(when)} (in ${relative(when - now)}).`;

  return (
    <div role="status" className={`flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm ${className}`}>
      <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-muted">{back} Your work is saved, so you can keep editing and exporting meanwhile.</p>
      </div>
    </div>
  );
}
