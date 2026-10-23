import { NextResponse } from "next/server";
import { sharedLimits, usageFor, visitorId } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How many AI requests this visitor has left. Read-only and free: no AI call, and it doesn't count against any
 * limit. `shared` says whether the counts come from the shared store (exact across server instances); when it's
 * false the usage meter relies on the browser's own count instead.
 */
export async function GET(req: Request) {
  const shared = sharedLimits();
  const usage = shared ? await usageFor(visitorId(req)).catch(() => null) : null;
  return NextResponse.json({ shared: shared && !!usage, usage }, { headers: { "Cache-Control": "no-store" } });
}
