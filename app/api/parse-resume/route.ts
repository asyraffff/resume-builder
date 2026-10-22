import mammoth from "mammoth";
import type Anthropic from "@anthropic-ai/sdk";
import { callStructuredStream } from "@/lib/claude";
import { PARSE_RESUME_SYSTEM } from "@/lib/prompts";
import { ParseResumeOutput, type AtsReport, type ParseResult } from "@/lib/schemas";
import { withIds } from "@/lib/ids";
import { mergeAts, runAtsChecks } from "@/lib/ats-checks";
import { guardRequest } from "@/lib/guard";
import { BodyTooLargeError, readForm } from "@/lib/body";
import { MAX_REQUEST_BYTES, MAX_RESUME_TEXT_CHARS, checkResumeFile } from "@/lib/upload-checks";
import { badRequest, errorResponse } from "@/lib/api-error";
import { ndjsonStream } from "@/lib/stream-response";

export const runtime = "nodejs";
export const maxDuration = 120;


/** Validates the upload, then streams progress events and finally the parsed resume and ATS report. */
export async function POST(req: Request) {
  const blocked = guardRequest(req, "parse-resume");
  if (blocked) return blocked;
  let content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  let rawText: string | undefined;
  let isPdf: boolean;
  let fileName: string;

  // Problems with the upload itself are answered with a plain JSON error before any streaming starts.
  try {
    const form = await readForm(req, MAX_REQUEST_BYTES);
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("Please choose a file to upload.");

    // Trust the file's bytes, not its name or the type the browser reported.
    const buf = Buffer.from(await file.arrayBuffer());
    const check = checkResumeFile(buf);
    if (!check.ok) return badRequest(check.error);
    isPdf = check.kind === "pdf";
    fileName = file.name.slice(0, 200);

    if (isPdf) {
      content = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
        { type: "text", text: "Parse this resume and review its ATS-friendliness." },
      ];
    } else {
      rawText = (await mammoth.extractRawText({ buffer: buf })).value;
      if (rawText.trim().length < 50) return badRequest("We couldn't read any text from that Word file.");
      if (rawText.length > MAX_RESUME_TEXT_CHARS) return badRequest("That document is far too long to be a resume.");
      content = [{ type: "text", text: `Parse this resume and review its ATS-friendliness.\n\n<resume>\n${rawText}\n</resume>` }];
    }
  } catch (err) {
    if (err instanceof BodyTooLargeError) return badRequest("The file is larger than 4 MB.", 413);
    return errorResponse(err);
  }

  return ndjsonStream<ParseResult>(
    async (onProgress) => {
      const out = await callStructuredStream({ role: "reading", schema: ParseResumeOutput, system: PARSE_RESUME_SYSTEM, content, effort: "medium" }, onProgress);
      const resume = withIds(out.resume);
      const rules = runAtsChecks(resume, { fileType: isPdf ? "pdf" : "docx", rawText });
      const ats: AtsReport = { ...out.ats, ...mergeAts(out.ats.score, out.ats.issues, rules) };
      return { resume, ats, fileName };
    },
    (text) => ({
      // Every extracted entry (job, degree, skill group…) has exactly one heading.
      count: (text.match(/"heading"\s*:/g) ?? []).length,
      stage: /"ats"\s*:/.test(text) ? "ats" : "resume",
    }),
  );
}
