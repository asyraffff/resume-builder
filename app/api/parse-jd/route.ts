import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { AiError, callStructuredStream } from "@/lib/claude";
import { PARSE_JD_SYSTEM } from "@/lib/prompts";
import { JobDescription, type ParseJdResult } from "@/lib/schemas";
import { fetchJobDescription } from "@/lib/fetch-jd";
import { screenJobDescription } from "@/lib/screen-jd";
import { badRequest, errorResponse } from "@/lib/api-error";
import { ndjsonStream } from "@/lib/stream-response";

export const runtime = "nodejs";
export const maxDuration = 120;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Reads a job description from pasted text, a link or screenshots. Input problems (and links that can't be read)
 * are answered with plain JSON before streaming starts; then progress events stream, followed by the result.
 */
export async function POST(req: Request) {
  let content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  let rawText = "";

  try {
    const form = await req.formData();
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
        if (!IMAGE_TYPES.includes(f.type as ImageType)) return badRequest("Screenshots must be PNG, JPG, WebP or GIF.");
        if (f.size > MAX_IMAGE_BYTES) return badRequest("Each screenshot must be under 5 MB.");
        content.push({
          type: "image",
          source: { type: "base64", media_type: f.type as ImageType, data: Buffer.from(await f.arrayBuffer()).toString("base64") },
        });
      }
      content.push({ type: "text", text: "These screenshots show one job posting (possibly across several images). Extract it." });
    } else {
      return badRequest("Unknown input mode.");
    }
  } catch (err) {
    return errorResponse(err);
  }

  return ndjsonStream<ParseJdResult>(
    async (onProgress) => {
      const parsed = await callStructuredStream({ schema: JobDescription, system: PARSE_JD_SYSTEM, content, effort: "low" }, onProgress);
      const { jd, warnings } = screenJobDescription(parsed, rawText);
      if (!jd.title && jd.requiredSkills.length === 0 && jd.responsibilities.length === 0) {
        throw new AiError(`That doesn't look like a job description. ${jd.summary}`.trim(), 400);
      }
      return { jd, warnings };
    },
    (text) => ({ count: 0, stage: /"keywords"\s*:/.test(text) ? "keywords" : "details" }),
  );
}
