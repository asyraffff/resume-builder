import type { JobDescription, MatchReport, Resume } from "./schemas";
import { plainResume } from "./inline";

/**
 * Deterministic keyword coverage: the same resume and job always give the same result,
 * so the score only moves when the resume actually changes.
 */

// Common spellings that mean the same thing. Keys and values are normalised (see norm()).
const ALIASES: Record<string, string[]> = {
  postgresql: ["postgres"],
  javascript: ["js"],
  typescript: ["ts"],
  kubernetes: ["k8s"],
  "machine learning": ["ml"],
  "artificial intelligence": ["ai"],
  "continuous integration": ["ci"],
  "ci cd": ["cicd", "ci and cd", "continuous integration and continuous delivery", "continuous integration continuous deployment"],
  "amazon web services": ["aws"],
  "google cloud platform": ["gcp", "google cloud"],
  "microsoft azure": ["azure"],
  "power bi": ["powerbi"],
  "node js": ["node", "nodejs"],
  "react js": ["react", "reactjs"],
  "next js": ["nextjs"],
  "vue js": ["vue", "vuejs"],
  "user experience": ["ux"],
  "user interface": ["ui"],
  "extract transform load": ["etl"],
  "elt": ["etl elt"],
  "sql server": ["mssql", "microsoft sql server"],
  "rest": ["restful", "rest api", "rest apis"],
  "dimensional modelling": ["dimensional modeling", "kimball", "star schema"],
  "data modelling": ["data modeling"],
  "optimisation": ["optimization"],
};

/** Lowercase, unify punctuation and whitespace, so "CI/CD", "ci-cd" and "CI CD" compare equal. */
export function norm(s: string): string {
  return ` ${s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\+/g, " plus ")
    .replace(/#/g, " sharp ")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\.(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** Words that make up a keyword's variants: itself, its aliases, and simple plural/singular forms. */
function variants(keyword: string): string[] {
  const base = norm(keyword).trim();
  // Drop a trailing parenthetical like "Accessibility (WCAG 2.1 AA)": either part may appear on its own.
  const out = new Set<string>([base]);
  const paren = keyword.match(/^(.*?)\s*\((.+)\)\s*$/);
  if (paren) {
    out.add(norm(paren[1]).trim());
    out.add(norm(paren[2]).trim());
  }
  for (const v of [...out]) {
    for (const [canon, alts] of Object.entries(ALIASES)) {
      if (v === canon || alts.includes(v)) [canon, ...alts].forEach((a) => out.add(a));
    }
    if (v.length > 3 && v.endsWith("s")) out.add(v.slice(0, -1));
    else if (v.length > 2) out.add(`${v}s`);
  }
  return [...out].filter(Boolean);
}

/** All visible resume text that recruiters and ATS systems search. Contact details are excluded. */
export function resumeText(resume: Resume): string {
  const r = plainResume(resume);
  const parts = [r.summary];
  for (const s of r.sections) {
    if (s.hidden) continue;
    parts.push(s.title);
    for (const it of s.items) parts.push(it.heading, it.subheading, ...it.bullets.map((b) => b.text));
  }
  return norm(parts.join(" \n "));
}

export type Coverage = { matched: string[]; missing: string[]; percent: number };

export function keywordCoverage(r: Resume, keywords: string[]): Coverage {
  const text = resumeText(r);
  // De-duplicate by normalised form, keeping the posting's first spelling.
  const seen = new Map<string, string>();
  for (const k of keywords) if (k.trim() && !seen.has(norm(k))) seen.set(norm(k), k.trim());
  const unique = [...seen.values()];
  const matched: string[] = [];
  const missing: string[] = [];
  for (const k of unique) (variants(k).some((v) => text.includes(` ${v} `)) ? matched : missing).push(k);
  return { matched, missing, percent: unique.length ? Math.round((matched.length / unique.length) * 100) : 0 };
}

/** Weights for the overall match score. Keyword coverage is live; the other two come from the last AI match. */
export const SCORE_WEIGHTS = { keywords: 0.35, experience: 0.4, seniority: 0.25 };

export type LiveScore = { score: number; keywords: number; experience: number; seniority: number; coverage: Coverage };

/** Overall match score for a resume against a job, using the AI's judgement plus live keyword coverage. */
export function liveScore(report: MatchReport, resume: Resume, jd: JobDescription): LiveScore {
  const coverage = keywordCoverage(resume, jd.keywords);
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const experience = clamp(report.breakdown.experienceRelevance);
  const seniority = clamp(report.breakdown.seniorityFit);
  // Old jobs without keywords fall back to the AI's keyword judgement.
  const keywords = jd.keywords.length ? coverage.percent : clamp(report.breakdown.keywordCoverage);
  const score = clamp(keywords * SCORE_WEIGHTS.keywords + experience * SCORE_WEIGHTS.experience + seniority * SCORE_WEIGHTS.seniority);
  return { score, keywords, experience, seniority, coverage };
}
