import mammoth from "mammoth";
import type Anthropic from "@anthropic-ai/sdk";
import { callStructuredStream } from "@/lib/claude";
import { PARSE_RESUME_SYSTEM } from "@/lib/prompts";
import { ParseResumeOutput, type AtsReport, type ParseResult } from "@/lib/schemas";
import { withIds } from "@/lib/ids";
import { mergeAts, runAtsChecks } from "@/lib/ats-checks";
import { badRequest, errorResponse } from "@/lib/api-error";
import { ndjsonStream } from "@/lib/stream-response";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 5 * 1024 * 1024;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Validates the upload, then streams progress events and finally the parsed resume and ATS report. */
export async function POST(req: Request) {
  let content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  let rawText: string | undefined;
  let isPdf: boolean;
  let fileName: string;

  // Problems with the upload itself are answered with a plain JSON error before any streaming starts.
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("Please choose a file to upload.");
    if (file.size > MAX_BYTES) return badRequest("The file is larger than 5 MB.");

    const name = file.name.toLowerCase();
    isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    const isDocx = file.type === DOCX_MIME || name.endsWith(".docx");
    if (!isPdf && !isDocx) return badRequest("Please upload a PDF or Word (.docx) file.");
    fileName = file.name;

    const buf = Buffer.from(await file.arrayBuffer());
    if (isPdf) {
      content = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
        { type: "text", text: "Parse this resume and review its ATS-friendliness." },
      ];
    } else {
      rawText = (await mammoth.extractRawText({ buffer: buf })).value;
      if (rawText.trim().length < 50) return badRequest("We couldn't read any text from that Word file.");
      content = [{ type: "text", text: `Parse this resume and review its ATS-friendliness.\n\n<resume>\n${rawText}\n</resume>` }];
    }
  } catch (err) {
    return errorResponse(err);
  }

  return ndjsonStream<ParseResult>(
    async (onProgress) => {
      const out = await callStructuredStream({ schema: ParseResumeOutput, system: PARSE_RESUME_SYSTEM, content, effort: "medium" }, onProgress);
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
