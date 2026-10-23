/** AI usage limits and the usage meter's numbers. Shared by the server (enforcement) and the browser (display). */

export type UsageRoute = "parse-resume" | "parse-jd" | "match";
export type Window = { limit: number; windowMs: number };

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

/** Per-visitor limits for each AI-backed route. Generous for real use, tight enough to stop scripted abuse. */
export const USAGE_LIMITS: Record<UsageRoute, Window[]> = {
  "parse-resume": [{ limit: 6, windowMs: 10 * MINUTE }, { limit: 30, windowMs: DAY }],
  "parse-jd": [{ limit: 15, windowMs: 10 * MINUTE }, { limit: 80, windowMs: DAY }],
  match: [{ limit: 8, windowMs: 10 * MINUTE }, { limit: 50, windowMs: DAY }],
};

export type RouteUsage = {
  /** Requests still allowed right now. */
  remaining: number;
  /** Size of the window that is currently the tightest, e.g. 8 for "8 every 10 minutes". */
  limit: number;
  window: "10 minutes" | "day";
  /** Per-visitor daily cap, for the explanation in the breakdown. */
  daily: number;
  /** Seconds until one more request frees up; null when nothing has been used. */
  nextFreeInSec: number | null;
};

export type Usage = {
  routes: Record<UsageRoute, RouteUsage>;
  /** Set when the app-wide daily limit (AI_DAILY_LIMIT) is used up, for everyone. */
  busy: { resetInSec: number } | null;
};

export const USAGE_LABELS: Record<UsageRoute, { one: string; many: string; verb: string }> = {
  match: { one: "match", many: "matches", verb: "match" },
  "parse-jd": { one: "job description", many: "job descriptions", verb: "add job descriptions" },
  "parse-resume": { one: "upload", many: "uploads", verb: "upload" },
};

const freesInSec = (ms: number | null) => (ms === null ? null : Math.ceil(ms / 1000));

/**
 * Remaining allowance for one route, from the times of past requests. The tightest window decides; on a tie
 * the shorter one, since it refills sooner. `cap` limits the result further (the app-wide limit on the server).
 */
export function routeUsage(route: UsageRoute, times: number[], now: number, cap = Infinity): RouteUsage {
  const windows = USAGE_LIMITS[route];
  const stats = windows.map((w) => {
    const inWindow = times.filter((t) => now - t < w.windowMs && t <= now);
    const oldest = inWindow.length ? Math.min(...inWindow) : null;
    return { left: w.limit - inWindow.length, freesInMs: oldest === null ? null : w.windowMs - (now - oldest) };
  });
  let i = 0;
  stats.forEach((s, k) => {
    if (s.left < stats[i].left) i = k;
  });
  return {
    remaining: Math.max(0, Math.min(stats[i].left, cap)),
    limit: windows[i].limit,
    window: windows[i].windowMs === DAY ? "day" : "10 minutes",
    daily: windows.find((w) => w.windowMs === DAY)?.limit ?? windows[i].limit,
    nextFreeInSec: freesInSec(stats[i].freesInMs),
  };
}
