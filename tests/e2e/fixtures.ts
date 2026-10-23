import type { Page, Route } from "@playwright/test";

/** Synthetic sample data (not anyone's real resume) and helpers that replay the AI routes. */

export const resume = {
  contact: { name: "Taylor Morgan", email: "taylor@example.com", phone: "", location: "Kuala Lumpur", links: ["github.com/taylor"] },
  summary: "Developer who builds web apps.",
  sections: [
    {
      id: "exp",
      type: "experience",
      title: "My Journey",
      hidden: false,
      items: [
        {
          id: "job1",
          heading: "Frontend Developer",
          subheading: "Acme Delivery",
          dates: "03/2021 - Present",
          location: "Remote",
          bullets: [
            { id: "b1", text: "Worked on the ordering web app using React" },
            { id: "b2", text: "Attended daily standups" },
          ],
        },
      ],
    },
    {
      id: "skills",
      type: "skills",
      title: "Skills",
      hidden: false,
      items: [{ id: "sk1", heading: "Languages", subheading: "", dates: "", location: "", bullets: [{ id: "s1", text: "TypeScript" }, { id: "s2", text: "React" }] }],
    },
  ],
};

export const ats = {
  score: 58,
  summary: "Readable, but headings and bullets need work.",
  issues: [{ severity: "medium", title: "Non-standard section headings", detail: 'Found "My Journey".', fix: 'Rename "My Journey" to "Experience".' }],
  strengths: ["Clear contact details"],
};

export const jd = {
  title: "Senior Frontend Engineer",
  company: "FoodRush",
  seniority: "Senior",
  requiredSkills: ["React", "TypeScript", "Accessibility"],
  niceToHaveSkills: ["Next.js"],
  responsibilities: ["Build customer-facing features"],
  keywords: ["React", "TypeScript", "Accessibility", "Next.js"],
  summary: "Senior frontend role on the ordering app.",
};

const sug = (s: Record<string, unknown>) => ({
  sectionId: "",
  itemId: "",
  bulletId: "",
  original: "",
  needsUserConfirmation: false,
  metricHints: [],
  reason: "Clearer and closer to the job's wording.",
  ...s,
});

export const report = {
  score: 55,
  breakdown: { keywordCoverage: 50, experienceRelevance: 70, seniorityFit: 50 },
  summary: "Good React base; accessibility isn't shown yet.",
  matchedKeywords: ["React", "TypeScript"],
  missingKeywords: [{ keyword: "Accessibility", truthfullyAddable: false, note: "No evidence yet." }],
  suggestions: [
    sug({ id: "s1", kind: "rewrite", target: "summary", original: "Developer who builds web apps.", proposed: "Frontend developer building React and TypeScript apps." }),
    sug({ id: "s2", kind: "rewrite", target: "section", sectionId: "exp", original: "My Journey", proposed: "Experience" }),
    sug({
      id: "s3",
      kind: "rewrite",
      target: "bullet",
      sectionId: "exp",
      itemId: "job1",
      bulletId: "b1",
      original: "Worked on the ordering web app using React",
      proposed: "Built customer-facing features for the React ordering app",
    }),
    sug({ id: "s4", kind: "remove", target: "bullet", sectionId: "exp", itemId: "job1", bulletId: "b2", original: "Attended daily standups", proposed: "" }),
  ],
  suggestedSectionOrder: ["exp", "skills"],
};

/** A streamed (newline-delimited JSON) response like the real routes send. */
const ndjson = (data: unknown) =>
  [{ type: "phase", phase: "sending" }, { type: "phase", phase: "analyzing" }, { type: "progress", chars: 400, count: 1, stage: "details" }, { type: "done", data }]
    .map((e) => JSON.stringify(e))
    .join("\n");

const fulfill = (route: Route, body: string) => route.fulfill({ status: 200, contentType: "application/x-ndjson", body });

/**
 * Replays all three AI routes. Returns counters so tests can check what was called. Also makes the browser's own
 * confirm/prompt answer "no" at once, as some in-app browsers do, so anything still relying on them fails here.
 */
export async function mockAi(page: Page) {
  await page.addInitScript(() => {
    window.confirm = () => false;
    window.prompt = () => null;
  });
  const calls = { parseResume: 0, parseJd: 0, match: 0 };
  await page.route("**/api/parse-resume", (r) => {
    calls.parseResume++;
    return fulfill(r, ndjson({ resume, ats, fileName: "taylor_morgan.pdf" }));
  });
  await page.route("**/api/parse-jd", (r) => {
    calls.parseJd++;
    return fulfill(r, ndjson({ jd, warnings: [] }));
  });
  await page.route("**/api/match", (r) => {
    calls.match++;
    return fulfill(r, ndjson(report));
  });
  return calls;
}

/** A tiny valid-looking PDF for the file picker (the route is mocked, so its contents don't matter). */
export const samplePdf = { name: "taylor_morgan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%sample\n") };

export const jobText =
  "Senior Frontend Engineer - FoodRush. We build the ordering app used by millions. You will build customer-facing features in React and TypeScript, champion accessibility, and mentor engineers. Requirements: 4+ years of frontend experience.";

/** Ticks the one-time privacy notice and uploads the sample resume; ends on the ATS page. */
export async function uploadSample(page: Page) {
  await page.goto("/");
  await page.getByText("I understand my resume will be sent").click();
  await page.locator('input[type="file"][accept*="pdf"]').setInputFiles(samplePdf);
  await page.waitForURL("**/ats");
}

type RouteUsage = { remaining: number; limit: number; window: string; daily: number; nextFreeInSec: number | null };
const fullUsage: Record<string, RouteUsage> = {
  match: { remaining: 8, limit: 8, window: "10 minutes", daily: 50, nextFreeInSec: null },
  "parse-jd": { remaining: 15, limit: 15, window: "10 minutes", daily: 80, nextFreeInSec: null },
  "parse-resume": { remaining: 6, limit: 6, window: "10 minutes", daily: 30, nextFreeInSec: null },
};

/** A usage snapshot like /api/usage returns, with some routes changed. */
export function usageWith(changes: Record<string, Partial<RouteUsage>>) {
  const routes = Object.fromEntries(Object.entries(fullUsage).map(([k, v]) => [k, { ...v, ...changes[k] }]));
  return { routes, busy: null as { resetInSec: number } | null };
}

/** Seeds this browser's AI request log. `hits` are minutes ago (negative numbers) per route. */
export async function seedUsage(page: Page, opts: { hits?: Record<string, number[]>; busyInMin?: number }) {
  await page.addInitScript((o) => {
    const now = Date.now();
    const hits = Object.fromEntries(Object.entries(o.hits ?? {}).map(([r, mins]) => [r, mins.map((m) => now + m * 60_000)]));
    const busyUntil = o.busyInMin ? now + o.busyInMin * 60_000 : null;
    localStorage.setItem("resume-tailor-ai-usage", JSON.stringify({ hits, blockedUntil: {}, busyUntil }));
  }, opts);
}
