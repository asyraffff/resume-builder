/**
 * In-memory sliding-window rate limiting. Each server instance counts on its own, so on serverless hosting (Vercel)
 * limits are per instance: good against casual abuse, not a hard guarantee. To make them global, replace `store`
 * with a shared one (e.g. Upstash Redis) that implements the same `hit` method.
 */

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

  reset() {
    this.hits.clear();
  }
}

export const store = new MemoryStore();

export function checkRateLimit(route: RouteName, visitor: string, now = Date.now()): Decision {
  const visitorResult = store.hit(`${route}:${visitor}`, RULES[route].windows, now);
  if (!visitorResult.ok) return { ok: false, retryAfterSec: Math.ceil(visitorResult.retryAfterMs / 1000), reason: "visitor" };
  const globalResult = store.hit("global", [{ limit: globalDailyLimit(), windowMs: DAY }], now);
  if (!globalResult.ok) return { ok: false, retryAfterSec: Math.ceil(globalResult.retryAfterMs / 1000), reason: "global" };
  return { ok: true };
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
