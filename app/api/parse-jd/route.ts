import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { AiError, callStructuredStream } from "@/lib/claude";
import { PARSE_JD_SYSTEM } from "@/lib/prompts";
import { JobDescription, type ParseJdResult } from "@/lib/schemas";
import { fetchJobDescription } from "@/lib/fetch-jd";
import { screenJobDescription } from "@/lib/screen-jd";
import { guardRequest } from "@/lib/guard";
import { BodyTooLargeError, readForm } from "@/lib/body";
import { MAX_REQUEST_BYTES, imageMediaType } from "@/lib/upload-checks";
import { badRequest, errorResponse } from "@/lib/api-error";
import { ndjsonStream } from "@/lib/stream-response";

export const runtime = "nodejs";
export const maxDuration = 120;


/**
 * Reads a job description from pasted text, a link or screenshots. Input problems (and links that can't be read)
 * are answered with plain JSON before streaming starts; then progress events stream, followed by the result.
 */
export async function POST(req: Request) {
  const blocked = guardRequest(req, "parse-jd");
  if (blocked) return blocked;
  let content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  let rawText = "";

  try {
    const form = await readForm(req, MAX_REQUEST_BYTES);
    const mode = String(form.get("mode") ?? "");

    if (mode === "text") {
      rawText = String(form.get("text") ?? "").trim();
      if (rawText.length < 100) return badRequest("Please paste the full job description (at least a few sentences).");
      content = [{ type: "text", text: `<job_posting>\n${rawText.slice(0, 30_000)}\n</job_posting>` }];
    } else if (mode === "url") {
      const result = await fetchJobDescription(String(form.get("url") ?? ""));
      if (!result.ok) {
        // Expected for LinkedIn and other sign-in pages: the UI switches to paste/screenshot.
        return NextResponse.json({ fallback: true, reason: result.reason, error: result.reason }, { status: 422 });
      }
      rawText = result.text;
      content = [{ type: "text", text: `Text scraped from a job page:\n<page>\n${rawText}\n</page>` }];
    } else if (mode === "image") {
      const files = form.getAll("image").filter((f): f is File => f instanceof File);
      if (files.length === 0) return badRequest("Please add a screenshot.");
      if (files.length > 5) return badRequest("Up to 5 screenshots at a time.");
      content = [];
      for (const f of files) {
        // The real image type comes from the bytes; a renamed file with the wrong contents is refused.
        const bytes = Buffer.from(await f.arrayBuffer());
        const mediaType = imageMediaType(bytes);
        if (!mediaType) return badRequest("Screenshots must be PNG, JPG, WebP or GIF images.");
        content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: bytes.toString("base64") } });
      }
      content.push({ type: "text", text: "These screenshots show one job posting (possibly across several images). Extract it." });
    } else {
      return badRequest("Unknown input mode.");
    }
  } catch (err) {
    if (err instanceof BodyTooLargeError) return badRequest("Those screenshots are too large together (4 MB limit). Use fewer or smaller images.", 413);
    return errorResponse(err);
  }

  return ndjsonStream<ParseJdResult>(
    async (onProgress) => {
      const parsed = await callStructuredStream({ role: "reading", schema: JobDescription, system: PARSE_JD_SYSTEM, content, effort: "low" }, onProgress);
      const { jd, warnings } = screenJobDescription(parsed, rawText);
      if (!jd.title && jd.requiredSkills.length === 0 && jd.responsibilities.length === 0) {
        throw new AiError(`That doesn't look like a job description. ${jd.summary}`.trim(), 400);
      }
      return { jd, warnings };
    },
    (text) => ({ count: 0, stage: /"keywords"\s*:/.test(text) ? "keywords" : "details" }),
  );
}
