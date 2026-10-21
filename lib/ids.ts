import { nanoid } from "nanoid";
import type { ExtractedResume, Resume } from "./schemas";

export const newId = () => nanoid(8);

export function withIds(r: ExtractedResume): Resume {
  return {
    contact: r.contact,
    summary: r.summary,
    sections: r.sections.map((s) => ({
      id: newId(),
      type: s.type,
      title: s.title,
      hidden: false,
      items: s.items.map((it) => ({
        id: newId(),
        heading: it.heading,
        subheading: it.subheading,
        dates: it.dates,
        location: it.location,
        bullets: it.bullets.map((text) => ({ id: newId(), text })),
      })),
    })),
  };
}
