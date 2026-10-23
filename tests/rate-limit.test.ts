import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Redis } from "@upstash/redis";
import { MemoryStore, RULES, RedisStore, checkRateLimit, retryText, setStore, usageFor, visitorId, type HitStore } from "@/lib/rate-limit";
import { guardRequest } from "@/lib/guard";

const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/match", { method: "POST", headers });

/** Just enough of Upstash's pipeline API (the four sorted-set commands RedisStore uses), kept in memory. */
function fakeRedis() {
  const sets = new Map<string, { score: number; member: string }[]>();
  const pipeline = () => {
    const ops: (() => unknown)[] = [];
    const p = {
      zremrangebyscore(key: string, min: number, max: number) {
        ops.push(() => {
          const before = sets.get(key) ?? [];
          const kept = before.filter((e) => e.score < min || e.score > max);
          sets.set(key, kept);
          return before.length - kept.length;
        });
        return p;
      },
      zrange(key: string) {
        ops.push(() => [...(sets.get(key) ?? [])].sort((a, b) => a.score - b.score).map((e) => e.member));
        return p;
      },
      zadd(key: string, e: { score: number; member: string }) {
        ops.push(() => sets.set(key, [...(sets.get(key) ?? []), e]) && 1);
        return p;
      },
      pexpire() {
        ops.push(() => 1);
        return p;
      },
      async exec() {
        return ops.map((op) => op());
      },
    };
    return p;
  };
  return { pipeline } as unknown as Redis;
}

// Every behaviour must hold whether counts live in memory (local) or in Redis (shared, on Vercel).
const stores: [string, () => HitStore][] = [
  ["memory", () => new MemoryStore()],
  ["Redis", () => new RedisStore(fakeRedis())],
];

describe.each(stores)("with the %s store", (_, makeStore) => {
  beforeEach(() => setStore(makeStore()));
  afterEach(() => {
    setStore(null);
    delete process.env.APP_ACCESS_CODE;
    delete process.env.AI_DAILY_LIMIT;
  });

  describe("rate limits", () => {
    it("allows up to the short-window limit, then says when to retry", async () => {
      const { limit, windowMs } = RULES.match.windows[0];
      const t0 = 1_000_000;
      for (let i = 0; i < limit; i++) expect((await checkRateLimit("match", "1.2.3.4", t0 + i)).ok).toBe(true);
      const blocked = await checkRateLimit("match", "1.2.3.4", t0 + limit);
      expect(blocked).toEqual({ ok: false, reason: "visitor", retryAfterSec: Math.ceil((windowMs - limit) / 1000) });
      // Once the window has passed, requests are allowed again.
      expect((await checkRateLimit("match", "1.2.3.4", t0 + windowMs + 1)).ok).toBe(true);
    });

    it("counts visitors and routes separately", async () => {
      const { limit } = RULES.match.windows[0];
      for (let i = 0; i < limit; i++) await checkRateLimit("match", "a", i);
      expect((await checkRateLimit("match", "a", limit)).ok).toBe(false);
      expect((await checkRateLimit("match", "b", limit)).ok).toBe(true);
      expect((await checkRateLimit("parse-jd", "a", limit)).ok).toBe(true);
    });

    it("enforces the daily limit as well as the short one", async () => {
      const [short, day] = RULES.match.windows;
      let t = 0;
      let allowed = 0;
      // Spread requests out so the short window never blocks; the daily one should.
      for (let i = 0; i < day.limit + 5; i++, t += short.windowMs / short.limit + 1) if ((await checkRateLimit("match", "x", t)).ok) allowed++;
      expect(allowed).toBe(day.limit);
    });

    it("has an app-wide daily backstop", async () => {
      process.env.AI_DAILY_LIMIT = "3";
      expect((await checkRateLimit("match", "a", 1)).ok).toBe(true);
      expect((await checkRateLimit("match", "b", 2)).ok).toBe(true);
      expect((await checkRateLimit("match", "c", 3)).ok).toBe(true);
      expect(await checkRateLimit("match", "d", 4)).toMatchObject({ ok: false, reason: "global" });
    });

    it("doesn't use up a visitor's allowance on requests the app-wide limit blocks", async () => {
      process.env.AI_DAILY_LIMIT = "1";
      await checkRateLimit("match", "a", 0);
      expect(await checkRateLimit("match", "b", 1)).toMatchObject({ ok: false, reason: "global" });
      delete process.env.AI_DAILY_LIMIT;
      expect((await usageFor("b", 2)).routes.match.remaining).toBe(8);
    });
  });

  describe("usage", () => {
    it("reports a fresh visitor's full allowance without counting as a request", async () => {
      const u = await usageFor("new", 10);
      expect(u.busy).toBeNull();
      expect(u.routes.match).toEqual({ remaining: 8, limit: 8, window: "10 minutes", daily: 50, nextFreeInSec: null });
      expect((await usageFor("new", 11)).routes.match.remaining).toBe(8);
    });

    it("counts down and says when the next request frees up", async () => {
      const t0 = 5_000_000;
      await checkRateLimit("match", "v", t0);
      await checkRateLimit("match", "v", t0 + 60_000);
      const u = await usageFor("v", t0 + 120_000);
      expect(u.routes.match.remaining).toBe(6);
      expect(u.routes.match.nextFreeInSec).toBe(8 * 60); // the first match was 2 minutes ago in a 10-minute window
      expect(u.routes["parse-jd"].remaining).toBe(15); // other routes untouched
    });

    it("switches to the daily window when that is the tighter one", async () => {
      const [short, day] = RULES.match.windows;
      let t = 0;
      for (let i = 0; i < day.limit - 2; i++, t += short.windowMs) await checkRateLimit("match", "d", t);
      expect((await usageFor("d", t)).routes.match).toMatchObject({ remaining: 2, limit: day.limit, window: "day" });
    });

    it("caps everyone by the app-wide limit and flags it as busy", async () => {
      process.env.AI_DAILY_LIMIT = "2";
      await checkRateLimit("match", "a", 0);
      expect((await usageFor("b", 1)).routes.match.remaining).toBe(1);
      await checkRateLimit("parse-jd", "a", 1);
      const u = await usageFor("b", 2);
      expect(u.routes.match.remaining).toBe(0);
      expect(u.busy).not.toBeNull();
    });
  });

  describe("request guard", () => {
    it("returns 429 with Retry-After and the visitor's usage when the limit is reached", async () => {
      const { limit } = RULES.match.windows[0];
      for (let i = 0; i < limit; i++) expect(await guardRequest(req({ "x-forwarded-for": "9.9.9.9" }), "match")).toBeNull();
      const res = (await guardRequest(req({ "x-forwarded-for": "9.9.9.9" }), "match"))!;
      expect(res.status).toBe(429);
      expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
      const body = await res.json();
      expect(body.error).toMatch(/limit for matches/);
      expect(body.limitReached).toBe(true);
      expect(body.usage.routes.match.remaining).toBe(0);
    });

    it("requires the access code only when one is configured", async () => {
      expect(await guardRequest(req(), "match")).toBeNull();
      process.env.APP_ACCESS_CODE = "open-sesame";
      const denied = (await guardRequest(req(), "match"))!;
      expect(denied.status).toBe(401);
      expect((await denied.json()).needsAccessCode).toBe(true);
      expect((await guardRequest(req({ "x-access-code": "wrong" }), "match"))!.status).toBe(401);
      expect(await guardRequest(req({ "x-access-code": "open-sesame" }), "match")).toBeNull();
    });
  });
});

describe("shared limits", () => {
  afterEach(() => setStore(null));

  it("count across server instances that share one Redis", async () => {
    // Two instances = two RedisStore objects over the same database; with memory each would allow 8.
    const redis = fakeRedis();
    const { limit } = RULES.match.windows[0];
    for (let i = 0; i < limit; i++) {
      setStore(new RedisStore(redis)); // a different "instance" for every request
      expect((await checkRateLimit("match", "v", i)).ok).toBe(true);
    }
    setStore(new RedisStore(redis));
    expect((await checkRateLimit("match", "v", limit)).ok).toBe(false);
  });

  it("let requests through (and log it) if the store is unreachable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    setStore({ times: () => Promise.reject(new Error("timeout")), add: () => Promise.reject(new Error("timeout")) });
    expect(await checkRateLimit("match", "v")).toEqual({ ok: true });
    expect(error).toHaveBeenCalledWith("Rate-limit store unavailable:", "timeout");
    error.mockRestore();
  });
});

describe("helpers", () => {
  it("identify visitors by the first forwarded address and phrase wait times", () => {
    expect(visitorId(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(visitorId(req())).toBe("local");
    expect(retryText(30)).toBe("30 seconds");
    expect(retryText(600)).toBe("10 minutes");
  });
});
