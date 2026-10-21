import { z } from "zod";

// ---------- Resume (canonical, with IDs) ----------

export const SECTION_TYPES = [
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "custom",
] as const;

export const Bullet = z.object({ id: z.string(), text: z.string() });

export const Item = z.object({
  id: z.string(),
  heading: z.string(), // e.g. job title / degree / project name
  subheading: z.string(), // e.g. company / school
  dates: z.string(),
  location: z.string(),
  bullets: z.array(Bullet),
});

export const Section = z.object({
  id: z.string(),
  type: z.enum(SECTION_TYPES),
  title: z.string(),
  hidden: z.boolean(),
  items: z.array(Item),
});

export const Contact = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.array(z.string()),
});

export const Resume = z.object({
  contact: Contact,
  summary: z.string(),
  sections: z.array(Section),
});

export type Bullet = z.infer<typeof Bullet>;
export type Item = z.infer<typeof Item>;
export type Section = z.infer<typeof Section>;
export type Resume = z.infer<typeof Resume>;

// ---------- What Claude extracts (no IDs; we assign them) ----------

export const ExtractedResume = z.object({
  contact: Contact,
  summary: z.string().describe("Professional summary; empty string if none"),
  sections: z.array(
    z.object({
      type: z.enum(SECTION_TYPES),
      title: z.string().describe("Heading exactly as written in the resume"),
      items: z.array(
        z.object({
          heading: z.string(),
          subheading: z.string(),
          dates: z.string(),
          location: z.string(),
          bullets: z.array(z.string()),
        }),
      ),
    }),
  ),
});
export type ExtractedResume = z.infer<typeof ExtractedResume>;

export const Severity = z.enum(["high", "medium", "low"]);

export const AtsIssue = z.object({
  severity: Severity,
  title: z.string(),
  detail: z.string(),
  fix: z.string(),
});
export type AtsIssue = z.infer<typeof AtsIssue>;

export const ParseResumeOutput = z.object({
  resume: ExtractedResume,
  ats: z.object({
    score: z.number().describe("0-100 ATS-friendliness score"),
    summary: z.string(),
    issues: z.array(AtsIssue),
    strengths: z.array(z.string()),
  }),
});

export type AtsReport = {
  score: number;
  summary: string;
  issues: AtsIssue[];
  strengths: string[];
};

/** Result of /api/parse-resume. */
export type ParseResult = { resume: Resume; ats: AtsReport; fileName: string };

// ---------- Job description ----------

export const JobDescription = z.object({
  title: z.string(),
  company: z.string(),
  seniority: z.string(),
  requiredSkills: z.array(z.string()),
  niceToHaveSkills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  keywords: z.array(z.string()).describe("ATS keywords/phrases a recruiter would search for"),
  summary: z.string(),
});
export type JobDescription = z.infer<typeof JobDescription>;

// ---------- Match report ----------

export const MetricHint = z.object({
  placeholder: z.string().describe('The exact placeholder text as it appears in proposed, including brackets, e.g. "[% reduction in batch runtime]"'),
  question: z.string().describe("A plain question the user can answer from memory, e.g. 'Roughly how long did one batch take before and after?'"),
  howToFind: z.string().describe("Where the real number can be found or how to estimate it honestly"),
  typicalRange: z.string().describe("A conservative, realistic range for this kind of work and seniority, e.g. '10–30%'; empty string if a range would be meaningless"),
  examples: z.array(z.string()).describe("2-3 modest example values in the placeholder's unit, e.g. ['15%', '25%']; the user must pick only what is true"),
  noNumberVersion: z.string().describe("The full proposed text rewritten honestly with no number, using scope or qualitative impact instead"),
});
export type MetricHint = z.infer<typeof MetricHint>;

export const Suggestion = z.object({
  id: z.string(),
  kind: z.enum(["rewrite", "add", "remove"]),
  target: z.enum(["summary", "bullet", "item", "skills", "section"]),
  sectionId: z.string().describe("Target section id; empty string for summary"),
  itemId: z.string().describe("Target item id; empty string if not applicable"),
  bulletId: z.string().describe("Target bullet id; empty for add/summary/item-level"),
  original: z.string(),
  proposed: z.string(),
  reason: z.string(),
  needsUserConfirmation: z
    .boolean()
    .describe("True if the proposal adds any claim, metric or skill not evidenced in the original resume"),
  metricHints: z.array(MetricHint).describe("One entry per [placeholder] in proposed; empty array if proposed has no placeholders"),
});
export type Suggestion = z.infer<typeof Suggestion>;

export const MatchReport = z.object({
  score: z.number().describe("0-100 overall fit"),
  breakdown: z.object({
    keywordCoverage: z.number(),
    experienceRelevance: z.number(),
    seniorityFit: z.number(),
  }),
  summary: z.string(),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(
    z.object({
      keyword: z.string(),
      truthfullyAddable: z
        .boolean()
        .describe("True if the resume already shows evidence of this, so it can be surfaced without inventing anything"),
      note: z.string(),
    }),
  ),
  suggestions: z.array(Suggestion),
  suggestedSectionOrder: z.array(z.string()).describe("Section ids in recommended order for this job"),
});
export type MatchReport = z.infer<typeof MatchReport>;
