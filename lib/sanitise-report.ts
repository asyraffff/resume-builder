import { hasInjection } from "./injection";
import type { MatchReport } from "./schemas";

const MAX_SUGGESTIONS = 25;
const MAX_TEXT = 600;

/**
 * Last line of defence on the AI's answer: scores stay within 0-100, the number and length of suggestions are
 * bounded, and any suggestion that carries text aimed at AI systems is dropped. Mutates and returns the report.
 */
export function sanitiseReport(report: MatchReport): MatchReport {
  const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0);
  report.score = clamp(report.score);
  report.breakdown = {
    keywordCoverage: clamp(report.breakdown.keywordCoverage),
    experienceRelevance: clamp(report.breakdown.experienceRelevance),
    seniorityFit: clamp(report.breakdown.seniorityFit),
  };
  report.suggestions = report.suggestions
    .filter((s) => !hasInjection(s.proposed) && s.proposed.length <= MAX_TEXT)
    .slice(0, MAX_SUGGESTIONS);
  report.matchedKeywords = report.matchedKeywords.slice(0, 60);
  report.missingKeywords = report.missingKeywords.filter((k) => !hasInjection(k.keyword)).slice(0, 60);
  return report;
}
