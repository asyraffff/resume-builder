/**
 * In-memory sliding-window rate limiting. Each server instance counts on its own, so on serverless hosting (Vercel)
 * limits are per instance: good against casual abuse, not a hard guarantee. To make them global, replace `store`
 * with a shared one (e.g. Upstash Redis) that implements the same `hit` method.
 */

import type { RouteUsage, Usage } from "./usage";

export type Window = { limit: number; windowMs: number };
export type Rule = { name: string; windows: Window[] };

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Per-visitor limits for each AI-backed route. Generous for real use, tight enough to stop scripted abuse. */
export const RULES = {
  "parse-resume": { name: "uploads", windows: [{ limit: 6, windowMs: 10 * MIN }, { limit: 30, windowMs: DAY }] },
  "parse-jd": { name: "job descriptions", windows: [{ limit: 15, windowMs: 10 * MIN }, { limit: 80, windowMs: DAY }] },
  match: { name: "matches", windows: [{ limit: 8, windowMs: 10 * MIN }, { limit: 50, windowMs: DAY }] },
} satisfies Record<string, Rule>;
export type RouteName = keyof typeof RULES;

/** Backstop on total AI calls per server instance per day, whoever makes them (override with AI_DAILY_LIMIT). */
export const globalDailyLimit = () => Number(process.env.AI_DAILY_LIMIT) || 1000;

export type Decision = { ok: true } | { ok: false; retryAfterSec: number; reason: "visitor" | "global" };

class MemoryStore {
  private hits = new Map<string, number[]>();
  private readonly maxKeys = 20_000;

  /** Records a hit for `key` if every window has room; otherwise reports when the oldest blocking hit expires. */
  hit(key: string, windows: Window[], now = Date.now()): { ok: true } | { ok: false; retryAfterMs: number } {
    const longest = Math.max(...windows.map((w) => w.windowMs));
    const times = (this.hits.get(key) ?? []).filter((t) => now - t < longest);
    for (const w of windows) {
      const inWindow = times.filter((t) => now - t < w.windowMs);
      if (inWindow.length >= w.limit) {
        this.hits.set(key, times);
        return { ok: false, retryAfterMs: w.windowMs - (now - inWindow[0]) };
      }
    }
    times.push(now);
    this.hits.delete(key); // re-insert so Map order tracks recency
    this.hits.set(key, times);
    if (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value!); // drop least recently used
    return { ok: true };
  }

  /** Read-only: how many hits fall in each window, and when the oldest of them expires. */
  peek(key: string, windows: Window[], now = Date.now()): { used: number; freesInMs: number | null }[] {
    const times = this.hits.get(key) ?? [];
    return windows.map((w) => {
      const inWindow = times.filter((t) => now - t < w.windowMs);
      return { used: inWindow.length, freesInMs: inWindow.length ? w.windowMs - (now - inWindow[0]) : null };
    });
  }

  reset() {
    this.hits.clear();
  }
}

export const store = new MemoryStore();

const globalWindows = () => [{ limit: globalDailyLimit(), windowMs: DAY }];

export function checkRateLimit(route: RouteName, visitor: string, now = Date.now()): Decision {
  // Check the app-wide limit first without recording, so a request it blocks doesn't use up the visitor's allowance.
  const [global] = store.peek("global", globalWindows(), now);
  if (global.used >= globalDailyLimit()) return { ok: false, retryAfterSec: Math.ceil((global.freesInMs ?? DAY) / 1000), reason: "global" };
  const visitorResult = store.hit(`${route}:${visitor}`, RULES[route].windows, now);
  if (!visitorResult.ok) return { ok: false, retryAfterSec: Math.ceil(visitorResult.retryAfterMs / 1000), reason: "visitor" };
  store.hit("global", globalWindows(), now);
  return { ok: true };
}

/** What `visitor` may still do on each route, for the usage meter. Doesn't count as a request. */
export function usageFor(visitor: string, now = Date.now()): Usage {
  const [global] = store.peek("global", globalWindows(), now);
  const globalLeft = Math.max(0, globalDailyLimit() - global.used);
  const secs = (ms: number | null) => (ms === null ? null : Math.ceil(ms / 1000));

  const routes = Object.fromEntries(
    (Object.keys(RULES) as RouteName[]).map((route) => {
      const windows = RULES[route].windows;
      const stats = store.peek(`${route}:${visitor}`, windows, now);
      // The tightest window decides; on a tie the shorter one, since it refills sooner.
      let i = 0;
      stats.forEach((s, k) => {
        if (windows[k].limit - s.used < windows[i].limit - stats[i].used) i = k;
      });
      const own = windows[i].limit - stats[i].used;
      const cappedByGlobal = globalLeft < own;
      const usage: RouteUsage = {
        remaining: Math.max(0, Math.min(own, globalLeft)),
        limit: windows[i].limit,
        window: windows[i].windowMs === DAY ? "day" : "10 minutes",
        daily: windows.find((w) => w.windowMs === DAY)?.limit ?? windows[i].limit,
        nextFreeInSec: secs(cappedByGlobal ? global.freesInMs : stats[i].freesInMs),
      };
      return [route, usage];
    }),
  ) as Usage["routes"];

  return { routes, busy: globalLeft === 0 ? { resetInSec: secs(global.freesInMs) ?? 0 } : null };
}

/** The visitor's IP as reported by the hosting platform (Vercel sets x-forwarded-for; the first entry is the client). */
export function visitorId(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
}

export function retryText(sec: number): string {
  if (sec < 90) return `${Math.max(1, sec)} seconds`;
  if (sec < 90 * 60) return `${Math.round(sec / 60)} minutes`;
  return `${Math.round(sec / 3600)} hours`;
}
