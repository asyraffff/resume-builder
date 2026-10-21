import { z } from "zod";
import { callStructuredStream } from "@/lib/claude";
import { MATCH_SYSTEM } from "@/lib/prompts";
import { JobDescription, MatchReport, Resume } from "@/lib/schemas";
import { badRequest } from "@/lib/api-error";
import { ndjsonStream } from "@/lib/stream-response";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ resume: Resume, jd: JobDescription });

/** Streams progress events, then the match report (see lib/stream-progress.ts). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Missing resume or job description.");
  const { resume, jd } = parsed.data;

  // Hidden sections are excluded from the export, so don't optimise them.
  const visible = { ...resume, sections: resume.sections.filter((s) => !s.hidden) };
  const sectionIds = new Set(visible.sections.map((s) => s.id));

  return ndjsonStream(
    async (onProgress) => {
      const report = await callStructuredStream(
        {
          schema: MatchReport,
          system: MATCH_SYSTEM,
          effort: "high",
          content: [
            {
              type: "text",
              text: `<job_description>\n${JSON.stringify(jd, null, 2)}\n</job_description>\n\n<resume>\n${JSON.stringify(visible, null, 2)}\n</resume>`,
            },
          ],
        },
        onProgress,
      );
      // Drop suggestions that reference ids that don't exist, so the UI never applies a broken patch.
      report.suggestions = report.suggestions.filter((s) => s.target === "summary" || sectionIds.has(s.sectionId));
      report.suggestedSectionOrder = report.suggestedSectionOrder.filter((id) => sectionIds.has(id));
      return report;
    },
    (text) => ({
      // Each finished suggestion object contains this key exactly once.
      count: (text.match(/"needsUserConfirmation"/g) ?? []).length,
      stage: text.includes('"suggestions"') ? "suggestions" : "summary",
    }),
  );
}
