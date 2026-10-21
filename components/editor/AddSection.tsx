"use client";

import { newId } from "@/lib/ids";
import { SECTION_TYPES, type Item, type Section } from "@/lib/schemas";

export const emptyItem = (): Item => ({ id: newId(), heading: "", subheading: "", dates: "", location: "", bullets: [{ id: newId(), text: "" }] });

export const DEFAULT_TITLES: Record<Section["type"], string> = {
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  certifications: "Certifications",
  custom: "Additional",
};

export function AddSection({ onAdd }: { onAdd: (t: Section["type"]) => void }) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-4 text-xs text-muted">
      <span>Add section:</span>
      {SECTION_TYPES.map((t) => (
        <button key={t} className="rounded-full border border-border px-2.5 py-1 hover:border-accent hover:text-accent" onClick={() => onAdd(t)}>
          {DEFAULT_TITLES[t]}
        </button>
      ))}
    </div>
  );
}
