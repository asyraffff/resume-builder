import type { AtsIssue, Resume } from "./schemas";
import { placeholdersInResume } from "./placeholders";
import { plainResume } from "./inline";
import { detectInjection } from "./injection";

/**
 * Words ATS systems recognise as section names. A heading counts as standard when every part of it (split on
 * "and", "&", "/" or commas) is made of these, ignoring filler words: "Education and Certifications",
 * "Core Competencies" and "Professional Experience" pass; "My Journey" doesn't.
 */
const SECTION_WORDS = new Set(
  (
    "experience employment work history career education academic qualifications background skills skill competencies " +
    "competency expertise technologies tools stack projects project certifications certification certificates licenses " +
    "licences courses coursework training summary profile objective about awards honors honours achievements " +
    "accomplishments publications languages volunteer volunteering leadership interests hobbies references activities " +
    "affiliations memberships research portfolio contact information"
  ).split(" "),
);
const FILLER_WORDS = new Set("professional relevant key core technical selected additional other me my of".split(" "));

export function isStandardHeading(title: string): boolean {
  const parts = title
    .toLowerCase()
    .replace(/[^a-z&/,\s]/g, " ")
    .split(/\s+and\s+|[&/,]/)
    .map((p) => p.split(/\s+/).filter((w) => w && !FILLER_WORDS.has(w)))
    .filter((words) => words.length);
  return parts.length > 0 && parts.every((words) => words.every((w) => SECTION_WORDS.has(w)));
}

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

/**
 * Deterministic ATS checks. Used at upload (with the file type and raw text) and live in the editor
 * on whatever version is on screen (no context needed).
 */
export function runAtsChecks(formatted: Resume, ctx: { fileType?: "pdf" | "docx"; rawText?: string } = {}): RuleIssue[] {
  // Check the words a recruiter reads, not formatting markers like **bold** or [text](link).
  const resume = plainResume(formatted);
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

  const nonStandard = resume.sections.filter((s) => !isStandardHeading(s.title));
  if (nonStandard.length > 0) {
    issues.push({
      severity: "medium",
      title: "Non-standard section headings",
      topic: /heading/i,
      detail: `ATS systems look for common headings. Found: ${nonStandard.map((s) => `"${s.title}"`).join(", ")}.`,
      fix: "Use standard headings such as Experience, Education, Skills, Projects, Certifications.",
    });
  }

  const seen = new Map<string, string>();
  const repeated = new Set<string>();
  for (const sec of resume.sections) {
    const key = sec.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key) continue;
    if (seen.has(key)) repeated.add(seen.get(key)!);
    else seen.set(key, sec.title.trim());
  }
  if (repeated.size > 0) {
    issues.push({
      severity: "low",
      title: "Two sections share a heading",
      topic: /heading/i,
      detail: `Found more than once: ${[...repeated].map((t) => `"${t}"`).join(", ")}. An ATS may merge them or keep only one.`,
      fix: "Merge them into one section, or rename one (for example, Education and Certifications).",
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

  const allText = [resume.summary, ...resume.sections.flatMap((s) => [s.title, ...s.items.flatMap((it) => [it.heading, it.subheading, ...it.bullets.map((b) => b.text)])])].join("\n");
  const injected = detectInjection(allText);
  if (injected.length > 0) {
    issues.push({
      severity: "high",
      title: "Hidden instructions aimed at AI screeners",
      topic: /(hidden|instructions?).*(ai|screener)|ai screener/i,
      detail: `Found: "${injected[0]}". Text like this tries to manipulate automated screening.`,
      fix: "Remove it: recruiters see it as a red flag and it can get the application rejected.",
    });
  }

  const placeholders = placeholdersInResume(resume);
  if (placeholders.length > 0) {
    issues.push({
      severity: "high",
      title: `${placeholders.length} unfilled placeholder${placeholders.length > 1 ? "s" : ""}`,
      topic: /placeholder/i,
      detail: `Text like ${placeholders[0].placeholder} is still in ${placeholders[0].where}. Recruiters will see it as-is.`,
      fix: "Replace each [placeholder] with your real number, or reword the bullet without it.",
    });
  }

  if (!resume.summary.trim()) {
    issues.push({
      severity: "low",
      title: "No professional summary",
      topic: /summary/i,
      detail: "A short summary at the top is where recruiters and ATS keyword searches look first.",
      fix: "Add 2–3 sentences on your role, experience and the skills this job asks for.",
    });
  }

  const visible = resume.sections.filter((s) => !s.hidden);
  const emptyBullets = visible.reduce((n, s) => n + s.items.reduce((m, it) => m + it.bullets.filter((b) => !b.text.trim()).length, 0), 0);
  if (emptyBullets > 0) {
    issues.push({
      severity: "low",
      title: `${emptyBullets} empty bullet${emptyBullets > 1 ? "s" : ""}`,
      topic: /empty bullet/i,
      detail: "Empty bullets are left out of the export, but they may mean something unfinished.",
      fix: "Fill them in or delete them.",
    });
  }

  const words = [resume.summary, ...visible.flatMap((s) => s.items.flatMap((it) => [it.heading, it.subheading, ...it.bullets.map((b) => b.text)]))]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  if (words > 900) {
    issues.push({
      severity: "medium",
      title: "Probably longer than two pages",
      topic: /(two|2)[ -]pages?|too long|length/i,
      detail: `About ${words} words. Most recruiters expect one page early in a career and two at most later on.`,
      fix: "Cut older or less relevant bullets, or hide sections that don't help for this job.",
    });
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
