import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { RULES, checkRateLimit, retryText, usageFor, visitorId, type RouteName } from "./rate-limit";

export const ACCESS_HEADER = "x-access-code";

/** True when the app is locked with an access code (APP_ACCESS_CODE set on the server). */
export const accessCodeRequired = () => !!process.env.APP_ACCESS_CODE;

function codeMatches(given: string): boolean {
  const expected = process.env.APP_ACCESS_CODE ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Runs before any AI-backed route does work: checks the optional access code, then the rate limits.
 * Returns a response to send back when the request must stop, or null to continue.
 */
export function guardRequest(req: Request, route: RouteName): Response | null {
  if (accessCodeRequired() && !codeMatches(req.headers.get(ACCESS_HEADER) ?? "")) {
    return NextResponse.json({ error: "This app needs an access code.", needsAccessCode: true }, { status: 401 });
  }
  const visitor = visitorId(req);
  const decision = checkRateLimit(route, visitor);
  if (!decision.ok) {
    const error =
      decision.reason === "global"
        ? "The app has reached its daily usage limit. Please try again later."
        : `You've reached the limit for ${RULES[route].name}. Please try again in ${retryText(decision.retryAfterSec)}.`;
    // The usage snapshot lets the page show when the visitor can try again, instead of a plain error.
    return NextResponse.json(
      { error, limitReached: true, usage: usageFor(visitor) },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSec) } },
    );
  }
  return null;
}
