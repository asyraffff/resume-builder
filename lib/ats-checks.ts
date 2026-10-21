import type { AtsIssue, Resume } from "./schemas";

const STANDARD_HEADINGS = [
  "experience",
  "work experience",
  "professional experience",
  "employment",
  "employment history",
  "education",
  "skills",
  "technical skills",
  "core skills",
  "projects",
  "certifications",
  "certificates",
  "summary",
  "professional summary",
  "profile",
  "awards",
  "publications",
  "languages",
  "volunteer",
  "volunteering",
  "leadership",
  "achievements",
];

const MONTH_YEAR = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\b/i;
const NUMERIC_DATE = /\b\d{1,2}\/\d{2,4}\b/;
const YEAR_ONLY = /^\s*\d{4}\s*(?:[-–—]|to)\s*(?:\d{4}|present|current)\s*$/i;

export function dateStyle(d: string): "month-year" | "numeric" | "year" | "other" | "empty" {
  if (!d.trim()) return "empty";
  if (MONTH_YEAR.test(d)) return "month-year";
  if (NUMERIC_DATE.test(d)) return "numeric";
  if (YEAR_ONLY.test(d) || /^\s*\d{4}\s*$/.test(d)) return "year";
  return "other";
}

/** Deterministic checks that complement the AI review. */
/** A rule finding plus a pattern that recognises the same problem in the AI's wording. */
export type RuleIssue = AtsIssue & { topic: RegExp };

export function runAtsChecks(resume: Resume, ctx: { fileType: "pdf" | "docx"; rawText?: string }): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const { contact } = resume;

  const bulletCount = resume.sections.reduce(
    (n, s) => n + s.items.reduce((m, it) => m + it.bullets.length, 0),
    0,
  );
  if (resume.sections.length === 0 || bulletCount === 0) {
    issues.push({
      severity: "high",
      title: "Little or no readable text",
      topic: /(readable|extract|scann|image-based|no text)/i,
      detail: "Almost no text could be read from the file. It may be a scanned image or designed in a graphics tool.",
      fix: "Export your resume from Word or Google Docs as a text-based PDF or DOCX.",
    });
  }

  if (!contact.email.trim()) {
    issues.push({
      severity: "high",
      title: "No email address found",
      topic: /e-?mail/i,
      detail: "Recruiters and ATS systems need an email to contact you.",
      fix: "Add your email address in the header as plain text (not inside an image or a page header).",
    });
  }
  if (!contact.phone.trim()) {
    issues.push({
      severity: "medium",
      title: "No phone number found",
      topic: /phone/i,
      detail: "Many ATS forms map a phone field from the resume.",
      fix: "Add a phone number in the header as plain text.",
    });
  }

  const nonStandard = resume.sections.filter(
    (s) => !STANDARD_HEADINGS.includes(s.title.trim().toLowerCase().replace(/[:&]/g, "").replace(/\s+/g, " ")),
  );
  if (nonStandard.length > 0) {
    issues.push({
      severity: "medium",
      title: "Non-standard section headings",
      topic: /heading/i,
      detail: `ATS systems look for common headings. Found: ${nonStandard.map((s) => `"${s.title}"`).join(", ")}.`,
      fix: "Use standard headings such as Experience, Education, Skills, Projects, Certifications.",
    });
  }

  const styles = new Set(
    resume.sections
      .flatMap((s) => s.items.map((it) => dateStyle(it.dates)))
      .filter((d) => d !== "empty"),
  );
  if (styles.size > 1) {
    issues.push({
      severity: "low",
      title: "Inconsistent date formats",
      topic: /date/i,
      detail: "Dates use more than one format, which can confuse date parsing.",
      fix: 'Use one format throughout, e.g. "Jan 2022 – Present".',
    });
  }

  const longBullets = resume.sections.flatMap((s) =>
    s.items.flatMap((it) => it.bullets.filter((b) => b.text.split(/\s+/).length > 45)),
  );
  if (longBullets.length > 0) {
    issues.push({
      severity: "low",
      title: `${longBullets.length} very long bullet${longBullets.length > 1 ? "s" : ""}`,
      topic: /(long|lengthy|wordy) bullet/i,
      detail: "Bullets over ~45 words are hard to scan for recruiters.",
      fix: "Split long bullets or trim them to one or two lines focused on impact.",
    });
  }

  if (ctx.fileType === "docx" && ctx.rawText) {
    // mammoth flattens table cells into separate short lines; many very short lines hint at tables/columns.
    const lines = ctx.rawText.split("\n").map((l) => l.trim()).filter(Boolean);
    const tiny = lines.filter((l) => l.length <= 3).length;
    if (lines.length > 20 && tiny / lines.length > 0.25) {
      issues.push({
        severity: "medium",
        title: "Possible tables or multi-column layout",
        topic: /(table|column|text box)/i,
        detail: "The document structure suggests tables or text boxes, which many ATS systems read out of order.",
        fix: "Use a single-column layout without tables or text boxes. This app's export does that for you.",
      });
    }
  }

  return issues;
}

const PENALTY = { high: 15, medium: 7, low: 3 } as const;

/** Blend AI score with deterministic findings the AI didn't already report. */
export function mergeAts(aiScore: number, aiIssues: AtsIssue[], ruleIssues: RuleIssue[]) {
  const aiText = aiIssues.map((i) => `${i.title} ${i.detail}`);
  const extra: AtsIssue[] = ruleIssues
    .filter((r) => !aiText.some((t) => r.topic.test(t)))
    .map((r) => ({ severity: r.severity, title: r.title, detail: r.detail, fix: r.fix }));
  const penalty = extra.reduce((p, i) => p + PENALTY[i.severity], 0);
  const order = { high: 0, medium: 1, low: 2 };
  return {
    score: Math.max(0, Math.min(100, Math.round(aiScore - penalty))),
    issues: [...aiIssues, ...extra].sort((a, b) => order[a.severity] - order[b.severity]),
  };
}
