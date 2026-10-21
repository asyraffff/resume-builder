import type { Resume, Section, Suggestion } from "./schemas";
import { newId } from "./ids";

/** Returns a new resume with the suggestion applied, or null if its target no longer exists. */
export function applySuggestion(resume: Resume, s: Suggestion, proposedOverride?: string): Resume | null {
  const proposed = (proposedOverride ?? s.proposed).trim();

  if (s.target === "summary") {
    return { ...resume, summary: proposed };
  }

  const section = resume.sections.find((sec) => sec.id === s.sectionId);
  if (!section) return null;

  const updateSection = (fn: (sec: Section) => Section | null): Resume | null => {
    const next = fn(section);
    if (!next) return null;
    return { ...resume, sections: resume.sections.map((sec) => (sec.id === section.id ? next : sec)) };
  };

  if (s.target === "section" && s.kind === "rewrite") {
    return updateSection((sec) => ({ ...sec, title: proposed }));
  }

  if (s.target === "skills" && s.kind === "add") {
    return updateSection((sec) => {
      if (sec.items.length === 0) {
        return {
          ...sec,
          items: [{ id: newId(), heading: "", subheading: "", dates: "", location: "", bullets: [{ id: newId(), text: proposed }] }],
        };
      }
      const targetId = sec.items.some((it) => it.id === s.itemId) ? s.itemId : sec.items[0].id;
      return {
        ...sec,
        items: sec.items.map((it) =>
          it.id === targetId ? { ...it, bullets: [...it.bullets, { id: newId(), text: proposed }] } : it,
        ),
      };
    });
  }

  const item = section.items.find((it) => it.id === s.itemId);
  if (!item) return null;

  return updateSection((sec) => {
    const items = sec.items.map((it) => {
      if (it.id !== item.id) return it;
      if (s.kind === "add") {
        return { ...it, bullets: [...it.bullets, { id: newId(), text: proposed }] };
      }
      if (!it.bullets.some((b) => b.id === s.bulletId)) return null;
      if (s.kind === "remove") {
        return { ...it, bullets: it.bullets.filter((b) => b.id !== s.bulletId) };
      }
      return { ...it, bullets: it.bullets.map((b) => (b.id === s.bulletId ? { ...b, text: proposed } : b)) };
    });
    if (items.some((it) => it === null)) return null;
    return { ...sec, items: items as Section["items"] };
  });
}

/** Reorders sections by the given ids; unknown ids are ignored and unlisted sections keep their relative order at the end. */
export function reorderSections(resume: Resume, order: string[]): Resume {
  const byId = new Map(resume.sections.map((s) => [s.id, s]));
  const listed = order.map((id) => byId.get(id)).filter((s): s is Section => !!s);
  const rest = resume.sections.filter((s) => !order.includes(s.id));
  return { ...resume, sections: [...listed, ...rest] };
}

/**
 * The resume text a suggestion replaces or removes, as it is now, or null for suggestions that only add
 * something (new bullets, skills) or whose target no longer exists.
 */
export function currentTextFor(resume: Resume, s: Suggestion): string | null {
  if (s.target === "summary") return resume.summary;
  const section = resume.sections.find((sec) => sec.id === s.sectionId);
  if (!section) return null;
  if (s.target === "section") return s.kind === "rewrite" ? section.title : null;
  if (s.target === "bullet" && (s.kind === "rewrite" || s.kind === "remove")) {
    const item = section.items.find((it) => it.id === s.itemId);
    return item?.bullets.find((b) => b.id === s.bulletId)?.text ?? null;
  }
  return null;
}

/** True when the text a suggestion was based on has been edited since, so accepting it would overwrite that edit. */
export function isStale(resume: Resume, s: Suggestion): boolean {
  const current = currentTextFor(resume, s);
  // Ignore case, spacing and punctuation: older reports hold the AI's copy of the text, which can differ slightly.
  const squash = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return current !== null && squash(current) !== squash(s.original);
}

/** Sets each suggestion's `original` to the exact text it targets in the resume the match was based on. */
export function pinOriginals(resume: Resume, suggestions: Suggestion[]): Suggestion[] {
  return suggestions.map((s) => {
    const current = currentTextFor(resume, s);
    return current === null ? s : { ...s, original: current };
  });
}
