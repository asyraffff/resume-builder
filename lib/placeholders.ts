import type { Resume } from "./schemas";

// Matches AI placeholders such as "[% reduction in runtime]" or "[X%]". Real bracketed text in a resume is rare, and a false
// positive only causes a warning, never a change.
// A bracket followed by "(" is a [text](link), not a placeholder.
const PLACEHOLDER = /\[[^\[\]\n]{1,80}\](?!\()/g;

export function findPlaceholders(text: string): string[] {
  return [...new Set(text.match(PLACEHOLDER) ?? [])];
}

export const hasPlaceholders = (text: string) => findPlaceholders(text).length > 0;

/** Replaces every occurrence of one placeholder with a value. */
export function fillPlaceholder(text: string, placeholder: string, value: string): string {
  return text.split(placeholder).join(value.trim());
}

/** Every unfilled placeholder in the resume, with where it is, for the export warning. */
export function placeholdersInResume(r: Resume): { where: string; placeholder: string }[] {
  const out: { where: string; placeholder: string }[] = [];
  const add = (where: string, text: string) => findPlaceholders(text).forEach((placeholder) => out.push({ where, placeholder }));
  add("Summary", r.summary);
  for (const s of r.sections) {
    if (s.hidden) continue;
    for (const it of s.items) {
      const where = [s.title, it.heading || it.subheading].filter(Boolean).join(" › ");
      add(where, `${it.heading} ${it.subheading}`);
      it.bullets.forEach((b) => add(where, b.text));
    }
  }
  return out;
}
