import { detectInjection, hasInjection } from "./injection";
import type { JobDescription } from "./schemas";

/**
 * Checks a parsed job description (and the raw posting text, when there is one) for text aimed at AI tools.
 * Returns the job with any such entries removed from its lists, plus excerpts to warn the user about.
 */
export function screenJobDescription(jd: JobDescription, rawText = ""): { jd: JobDescription; warnings: string[] } {
  const fields = [jd.title, jd.company, jd.summary, ...jd.requiredSkills, ...jd.niceToHaveSkills, ...jd.responsibilities, ...jd.keywords];
  const warnings = [...new Set([...detectInjection(rawText), ...detectInjection(fields.join("\n"))])].slice(0, 5);
  const keep = (xs: string[]) => xs.filter((x) => !hasInjection(x));
  return {
    jd: {
      ...jd,
      summary: hasInjection(jd.summary) ? "" : jd.summary,
      requiredSkills: keep(jd.requiredSkills),
      niceToHaveSkills: keep(jd.niceToHaveSkills),
      responsibilities: keep(jd.responsibilities),
      keywords: keep(jd.keywords),
    },
    warnings,
  };
}
