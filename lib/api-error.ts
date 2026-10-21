import "server-only";
import { NextResponse } from "next/server";
import { AiError } from "./claude";

export function errorResponse(err: unknown) {
  if (err instanceof AiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // Never log request bodies: resumes contain personal data.
  console.error("Unexpected error:", err instanceof Error ? err.message : "unknown");
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export const badRequest = (message: string) => NextResponse.json({ error: message }, { status: 400 });
