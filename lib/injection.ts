/**
 * Detects text aimed at AI systems ("prompt injection"), e.g. hidden lines in a resume telling an AI screener to
 * rate the candidate highly, or traps in a job posting asking AI tools to mention a word. Pattern-based and
 * deliberately conservative: it's a second line of defence behind the prompts, which already treat this text as data.
 */

const AI = String.raw`(?:ai|a\.i\.|artificial intelligence|assistant|chat ?gpt|gpt(?:-?\d)?|claude|gemini|copilot|llm|large language model|language model|bot|screener|screening (?:tool|software|system)|ats)`;

const PATTERNS: RegExp[] = [
  // "Ignore all previous instructions", "disregard the rules above"
  /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|preceding|all|any|your)\b[^.\n]{0,20}\b(?:instructions?|prompts?|rules?|directions?|guidelines?)\b/i,
  /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,30}\b(?:instructions?|prompts?|rules?|directions?|guidelines?)\b[^.\n]{0,15}\b(?:above|before|so far|given earlier)\b/i,
  // "You are now a…", "act as an AI that…"
  new RegExp(String.raw`\b(?:you are (?:now )?|act as |pretend (?:to be|you are) )(?:an? |the )?${AI}\b`, "i"),
  // "If you are an AI / language model…", "Note to the AI…", "AI reviewers:"
  new RegExp(String.raw`\b(?:if you(?:'re| are) (?:an? )?|as an? |note (?:to|for) (?:the |any )?|message (?:to|for) (?:the |any )?|instructions? (?:to|for) (?:the |any )?)${AI}\b`, "i"),
  // "Rate/score this candidate 10/10", "rank this resume as the top applicant"
  /\b(?:rate|score|rank|grade|evaluate|mark|classify|recommend)\b[^.\n]{0,40}\b(?:candidate|resume|cv|applicant|me|this person|profile)\b[^.\n]{0,40}\b(?:100|10\s*\/\s*10|5\s*\/\s*5|highest|top|perfect|maximum|excellent|best|strong(?:est)? (?:hire|match|fit))\b/i,
  // Traps in job postings: "include the word 'banana' in your application"
  /\b(?:include|mention|use|add|write|start (?:your|the) (?:answer|reply|application) with)\b[^.\n]{0,25}\bthe (?:word|phrase|term|code ?word|keyword)\b/i,
  /\b(?:system prompt|developer (?:message|mode)|jailbreak|prompt injection)\b/i,
];

/** Returns one short excerpt per suspicious passage; matches that overlap or sit close together are merged. */
export function detectInjection(text: string): string[] {
  const ranges: [number, number][] = [];
  for (const re of PATTERNS) {
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (const m of text.matchAll(global)) ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  if (!ranges.length) return [];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [ranges[0]];
  for (const [s, e] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (s <= last[1] + 40) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged.slice(0, 5).map(([s, e]) => {
    const start = Math.max(0, s - 20);
    const end = Math.min(text.length, e + 20, start + 200);
    const excerpt = text.slice(start, end).replace(/\s+/g, " ").trim();
    return (start > 0 ? "…" : "") + excerpt + (end < text.length ? "…" : "");
  });
}

export const hasInjection = (text: string) => detectInjection(text).length > 0;
