"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DAY, USAGE_LABELS, routeUsage, type Usage, type UsageRoute } from "@/lib/usage";
import { STORAGE_PREFIX } from "@/lib/privacy";

/**
 * The visitor's remaining AI allowance: a header chip with a breakdown, a heads-up beside AI buttons when
 * running low, and a calm card (instead of an error) once a limit is reached.
 *
 * The browser keeps its own log of the AI requests it sends and applies the same limits as the server
 * (lib/usage.ts), so the meter updates immediately and doesn't depend on which server instance answers: on
 * Vercel each API route can run in a separate instance with its own memory. The server still enforces the
 * limits; when it refuses a request, its own numbers (sent with the refusal) take over for that route.
 */

type Log = {
  /** When each AI request was sent, per route (kept for a day). */
  hits: Partial<Record<UsageRoute, number[]>>;
  /** The server refused this route until then (it may count more than this browser, e.g. a shared network). */
  blockedUntil: Partial<Record<UsageRoute, number>>;
  /** The app-wide daily limit is used up until then. */
  busyUntil: number | null;
};

const LOG_KEY = `${STORAGE_PREFIX}-ai-usage`;
const empty = (): Log => ({ hits: {}, blockedUntil: {}, busyUntil: null });

let log: Log | null = null;
const listeners = new Set<() => void>();

function readLog(): Log {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY) ?? "null");
    if (raw && typeof raw === "object" && raw.hits) return { ...empty(), ...raw };
  } catch {
    /* unavailable or corrupt: start fresh */
  }
  return empty();
}

function getLog(): Log {
  return (log ??= readLog());
}

function saveLog(next: Log) {
  const now = Date.now();
  // Drop anything older than the longest window so the log stays small.
  for (const r of Object.keys(next.hits) as UsageRoute[]) next.hits[r] = next.hits[r]!.filter((t) => now - t < DAY);
  log = next;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
  } catch {
    /* the meter still works for this page */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  // Another tab sent a request (or deleted all data): pick up its log.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== LOG_KEY) return;
    log = readLog();
    l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Called when the server accepted an AI request (it counts from that moment). */
export function recordAiRequest(route: UsageRoute) {
  const cur = getLog();
  saveLog({ ...cur, hits: { ...cur.hits, [route]: [...(cur.hits[route] ?? []), Date.now()] } });
}

/** Called with the server's numbers when it refused a request because of a limit. */
export function applyServerUsage(route: UsageRoute, usage: Usage) {
  const now = Date.now();
  const cur = getLog();
  const r = usage.routes[route];
  const blockedUntil = { ...cur.blockedUntil };
  if (r.remaining === 0) blockedUntil[route] = now + (r.nextFreeInSec ?? 60) * 1000;
  saveLog({ ...cur, blockedUntil, busyUntil: usage.busy ? now + usage.busy.resetInSec * 1000 : cur.busyUntil });
}

function computeUsage(l: Log, now: number): Usage {
  const routes = Object.fromEntries(
    (Object.keys(USAGE_LABELS) as UsageRoute[]).map((route) => {
      const u = routeUsage(route, l.hits[route] ?? [], now);
      const blocked = l.blockedUntil[route];
      return [route, blocked && blocked > now ? { ...u, remaining: 0, nextFreeInSec: Math.ceil((blocked - now) / 1000) } : u];
    }),
  ) as Usage["routes"];
  const busy = l.busyUntil && l.busyUntil > now ? { resetInSec: Math.ceil((l.busyUntil - now) / 1000) } : null;
  return { routes, busy };
}

type Snapshot = { usage: Usage; at: number };

/** Current usage, re-computed when the log changes and every 15 seconds so "in 8 min" and refills stay current. */
function useUsage(): { snap: Snapshot | null; now: number } {
  const current = useSyncExternalStore(subscribe, getLog, () => null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  // A request just logged is newer than the last tick: measure from whichever is later.
  const at = Math.max(now, ...Object.values(current?.hits ?? {}).flat());
  return { snap: current ? { usage: computeUsage(current, at), at } : null, now: at };
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
        title={`${label}. Click for details.`}
        aria-label={`${label}. Your AI usage`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11" />
        </svg>
        {/* The full label only on wide screens; otherwise just the number, so it never crowds the step menu. */}
        <span className="hidden xl:inline">{label}</span>
        <span className="tabular-nums xl:hidden">{busy ? "Paused" : m.remaining}</span>
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
                const used = r.limit - r.remaining;
                // The bar shows what's been used, so a fresh allowance is an empty track (not a "full" bar that
                // reads as maxed out). It turns amber when running low and red when nothing is left.
                const pct = Math.round((used / r.limit) * 100);
                const fill = r.remaining === 0 ? "bg-bad" : isLow(r.remaining, r.limit) ? "bg-warn" : "bg-muted/60";
                return (
                  <li key={route}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="first-letter:uppercase">{USAGE_LABELS[route].many}</span>
                      <span className={`tabular-nums ${r.remaining === 0 ? "text-bad" : isLow(r.remaining, r.limit) ? "text-warn" : "text-foreground"}`}>
                        <span className="font-medium">{r.remaining}</span> left
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 rounded-full bg-border"
                      role="meter"
                      aria-label={`${USAGE_LABELS[route].many} used`}
                      aria-valuemin={0}
                      aria-valuemax={r.limit}
                      aria-valuenow={used}
                    >
                      {used > 0 && <div className={`h-1.5 rounded-full ${fill}`} style={{ width: `${Math.max(pct, 4)}%` }} />}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {used === 0
                        ? `None used · ${r.limit} per ${r.window === "day" ? "day" : "10 minutes"}`
                        : `${used} of ${r.limit} used${r.nextFreeInSec !== null ? ` · next frees up in ${relative(atTime(snap, r.nextFreeInSec) - now)}` : ""}`}
                    </p>
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
