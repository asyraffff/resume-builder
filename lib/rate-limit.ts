/**
 * Sliding-window rate limiting. With Upstash Redis configured (the env vars Vercel's Upstash integration adds),
 * every server instance shares one set of counts, so limits are exact. Without it the counts live in each
 * instance's memory: fine locally, but on Vercel each instance (and each API route) counts on its own.
 */

import { Redis } from "@upstash/redis";
import { DAY, USAGE_LABELS, USAGE_LIMITS, routeUsage, type Usage, type UsageRoute, type Window } from "./usage";

export type { Window };
export type RouteName = UsageRoute;

/** Per-visitor limits for each AI-backed route (defined in lib/usage.ts so the browser's usage meter matches). */
export const RULES = Object.fromEntries(
  (Object.keys(USAGE_LIMITS) as RouteName[]).map((r) => [r, { name: USAGE_LABELS[r].many, windows: USAGE_LIMITS[r] }]),
) as Record<RouteName, { name: string; windows: Window[] }>;

/** Backstop on total AI calls per day, whoever makes them (override with AI_DAILY_LIMIT). */
export const globalDailyLimit = () => Number(process.env.AI_DAILY_LIMIT) || 1000;

export type Decision = { ok: true } | { ok: false; retryAfterSec: number; reason: "visitor" | "global" };

/** Where request times are kept. Times older than a day (the longest window) are dropped. */
export interface HitStore {
  times(key: string, now: number): Promise<number[]>;
  add(key: string, now: number): Promise<void>;
}

export class MemoryStore implements HitStore {
  private hits = new Map<string, number[]>();
  private readonly maxKeys = 20_000;

  async times(key: string, now: number) {
    return (this.hits.get(key) ?? []).filter((t) => now - t < DAY);
  }

  async add(key: string, now: number) {
    const times = [...(await this.times(key, now)), now];
    this.hits.delete(key); // re-insert so Map order tracks recency
    this.hits.set(key, times);
    if (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value!); // drop least recently used
  }

  reset() {
    this.hits.clear();
  }
}

/** One sorted set per key: members are "time:random" (unique even for simultaneous requests), scored by time. */
export class RedisStore implements HitStore {
  constructor(
    private redis: Redis,
    private prefix = "rt:rl:",
  ) {}

  async times(key: string, now: number) {
    const p = this.redis.pipeline();
    p.zremrangebyscore(this.prefix + key, 0, now - DAY);
    p.zrange(this.prefix + key, 0, -1);
    const [, members] = await p.exec<[number, unknown[]]>();
    // The client JSON-encodes members by default; read the leading timestamp whether or not it comes back quoted.
    return members.map((m) => Number(/\d+/.exec(String(m))?.[0])).filter((t) => Number.isFinite(t));
  }

  async add(key: string, now: number) {
    const p = this.redis.pipeline();
    p.zadd(this.prefix + key, { score: now, member: `${now}:${Math.random().toString(36).slice(2, 10)}` });
    p.pexpire(this.prefix + key, DAY); // the whole key disappears a day after its last request
    await p.exec();
  }
}

function redisFromEnv(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

export const memoryStore = new MemoryStore();
let store: HitStore | null = null;

/** The store in use: Redis when configured, otherwise memory. */
export function getStore(): HitStore {
  if (!store) {
    const redis = redisFromEnv();
    store = redis ? new RedisStore(redis) : memoryStore;
  }
  return store;
}
/** True when counts are shared by every server instance (Redis), so the server's numbers are exact. */
export const sharedLimits = () => getStore() instanceof RedisStore;

/** Swaps the store (tests); null goes back to choosing from the environment. */
export function setStore(s: HitStore | null) {
  store = s;
}

const GLOBAL = "global";
const globalWindow = (): Window => ({ limit: globalDailyLimit(), windowMs: DAY });

/** If the window is full, how long until a slot frees up (the oldest request that keeps it full expires). */
function waitMs(times: number[], w: Window, now: number): number | null {
  const inWindow = times.filter((t) => now - t < w.windowMs).sort((a, b) => a - b);
  return inWindow.length >= w.limit ? w.windowMs - (now - inWindow[inWindow.length - w.limit]) : null;
}

export async function checkRateLimit(route: RouteName, visitor: string, now = Date.now()): Promise<Decision> {
  const s = getStore();
  try {
    // The app-wide limit is checked first and recorded last, so a request it blocks doesn't use up the
    // visitor's own allowance.
    const [global, own] = await Promise.all([s.times(GLOBAL, now), s.times(`${route}:${visitor}`, now)]);
    const globalWait = waitMs(global, globalWindow(), now);
    if (globalWait !== null) return { ok: false, retryAfterSec: Math.ceil(globalWait / 1000), reason: "global" };
    for (const w of RULES[route].windows) {
      const wait = waitMs(own, w, now);
      if (wait !== null) return { ok: false, retryAfterSec: Math.ceil(wait / 1000), reason: "visitor" };
    }
    await Promise.all([s.add(`${route}:${visitor}`, now), s.add(GLOBAL, now)]);
    return { ok: true };
  } catch (err) {
    // If the store is unreachable, let the request through rather than take the app down; the Anthropic spend
    // limit is the backstop. Logged so it shows up in the hosting logs.
    console.error("Rate-limit store unavailable:", err instanceof Error ? err.message : "unknown");
    return { ok: true };
  }
}

/** What `visitor` may still do on each route, sent with limit responses. Doesn't count as a request. */
export async function usageFor(visitor: string, now = Date.now()): Promise<Usage> {
  const s = getStore();
  const routes = Object.keys(RULES) as RouteName[];
  const [global, ...perRoute] = await Promise.all([s.times(GLOBAL, now), ...routes.map((r) => s.times(`${r}:${visitor}`, now))]);
  const globalLeft = Math.max(0, globalDailyLimit() - global.filter((t) => now - t < DAY).length);
  const usage = Object.fromEntries(routes.map((r, i) => [r, routeUsage(r, perRoute[i], now, globalLeft)])) as Usage["routes"];
  const globalWait = waitMs(global, globalWindow(), now);
  return { routes: usage, busy: globalWait !== null ? { resetInSec: Math.ceil(globalWait / 1000) } : null };
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
