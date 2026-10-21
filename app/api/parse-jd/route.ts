import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { callStructured } from "@/lib/claude";
import { PARSE_JD_SYSTEM } from "@/lib/prompts";
import { JobDescription } from "@/lib/schemas";
import { fetchJobDescription } from "@/lib/fetch-jd";
import { screenJobDescription } from "@/lib/screen-jd";
import { badRequest, errorResponse } from "@/lib/api-error";

export const runtime = "nodejs";
export const maxDuration = 120;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const mode = String(form.get("mode") ?? "");
    let content: Anthropic.Beta.Messages.BetaContentBlockParam[];
    let rawText = "";

    if (mode === "text") {
      rawText = String(form.get("text") ?? "").trim();
      if (rawText.length < 100) return badRequest("Please paste the full job description (at least a few sentences).");
      content = [{ type: "text", text: `<job_posting>\n${rawText.slice(0, 30_000)}\n</job_posting>` }];
    } else if (mode === "url") {
      const result = await fetchJobDescription(String(form.get("url") ?? ""));
      if (!result.ok) {
        // 200 with fallback flag: this is an expected outcome, not an error.
        return NextResponse.json({ fallback: true, reason: result.reason });
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

    const parsed = await callStructured({ schema: JobDescription, system: PARSE_JD_SYSTEM, content, effort: "low" });
    const { jd, warnings } = screenJobDescription(parsed, rawText);
    if (!jd.title && jd.requiredSkills.length === 0 && jd.responsibilities.length === 0) {
      return badRequest("That doesn't look like a job description. " + jd.summary);
    }
    return NextResponse.json({ jd, warnings });
  } catch (err) {
    return errorResponse(err);
  }
}
