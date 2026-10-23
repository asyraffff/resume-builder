/** What a visitor may still do, as reported by /api/usage and with limit errors. Shared by server and browser. */

export type UsageRoute = "parse-resume" | "parse-jd" | "match";

export type RouteUsage = {
  /** Requests still allowed right now (already capped by the app-wide daily limit). */
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
