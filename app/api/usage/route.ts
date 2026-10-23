import { NextResponse } from "next/server";
import { usageFor, visitorId } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How many AI requests this visitor has left, for the usage meter. Read-only and free: it calls no AI and
 * doesn't count against any limit. On hosting with several server instances the numbers are approximate,
 * because each instance keeps its own counts (see lib/rate-limit.ts).
 */
export function GET(req: Request) {
  return NextResponse.json(usageFor(visitorId(req)), { headers: { "Cache-Control": "no-store" } });
}
