import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RULES, checkRateLimit, retryText, store, visitorId } from "@/lib/rate-limit";
import { guardRequest } from "@/lib/guard";

const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/match", { method: "POST", headers });

beforeEach(() => store.reset());
afterEach(() => {
  delete process.env.APP_ACCESS_CODE;
  delete process.env.AI_DAILY_LIMIT;
});

describe("rate limits", () => {
  it("allows up to the short-window limit, then says when to retry", () => {
    const { limit, windowMs } = RULES.match.windows[0];
    const t0 = 1_000_000;
    for (let i = 0; i < limit; i++) expect(checkRateLimit("match", "1.2.3.4", t0 + i).ok).toBe(true);
    const blocked = checkRateLimit("match", "1.2.3.4", t0 + limit);
    expect(blocked).toEqual({ ok: false, reason: "visitor", retryAfterSec: Math.ceil((windowMs - limit) / 1000) });
    // Once the window has passed, requests are allowed again.
    expect(checkRateLimit("match", "1.2.3.4", t0 + windowMs + 1).ok).toBe(true);
  });

  it("counts visitors and routes separately", () => {
    const { limit } = RULES.match.windows[0];
    for (let i = 0; i < limit; i++) checkRateLimit("match", "a", i);
    expect(checkRateLimit("match", "a", limit).ok).toBe(false);
    expect(checkRateLimit("match", "b", limit).ok).toBe(true);
    expect(checkRateLimit("parse-jd", "a", limit).ok).toBe(true);
  });

  it("enforces the daily limit as well as the short one", () => {
    const [short, day] = RULES.match.windows;
    let t = 0;
    let allowed = 0;
    // Spread requests out so the short window never blocks; the daily one should.
    for (let i = 0; i < day.limit + 5; i++, t += short.windowMs / short.limit + 1) if (checkRateLimit("match", "x", t).ok) allowed++;
    expect(allowed).toBe(day.limit);
  });

  it("has a global per-instance backstop", () => {
    process.env.AI_DAILY_LIMIT = "3";
    expect(checkRateLimit("match", "a").ok).toBe(true);
    expect(checkRateLimit("match", "b").ok).toBe(true);
    expect(checkRateLimit("match", "c").ok).toBe(true);
    expect(checkRateLimit("match", "d")).toMatchObject({ ok: false, reason: "global" });
  });

  it("identifies visitors by the first forwarded address", () => {
    expect(visitorId(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(visitorId(req())).toBe("local");
    expect(retryText(30)).toBe("30 seconds");
    expect(retryText(600)).toBe("10 minutes");
  });
});

describe("request guard", () => {
  it("returns 429 with Retry-After when the limit is reached", async () => {
    const { limit } = RULES.match.windows[0];
    for (let i = 0; i < limit; i++) expect(guardRequest(req({ "x-forwarded-for": "9.9.9.9" }), "match")).toBeNull();
    const res = guardRequest(req({ "x-forwarded-for": "9.9.9.9" }), "match")!;
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await res.json()).error).toMatch(/limit for matches/);
  });

  it("requires the access code only when one is configured", async () => {
    expect(guardRequest(req(), "match")).toBeNull();
    process.env.APP_ACCESS_CODE = "open-sesame";
    const denied = guardRequest(req(), "match")!;
    expect(denied.status).toBe(401);
    expect((await denied.json()).needsAccessCode).toBe(true);
    expect(guardRequest(req({ "x-access-code": "wrong" }), "match")!.status).toBe(401);
    expect(guardRequest(req({ "x-access-code": "open-sesame" }), "match")).toBeNull();
  });
});
