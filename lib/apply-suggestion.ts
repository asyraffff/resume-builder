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
