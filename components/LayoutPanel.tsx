"use client";

import { DEFAULT_LAYOUT, TEMPLATES, type Layout } from "@/lib/layout";
import type { Resume } from "@/lib/schemas";
import { useResumeStore } from "@/store/resume-store";

type Option<T extends string> = { value: T; label: string };

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Option<T>[]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <div className="flex rounded-lg bg-background p-0.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${value === o.value ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Template, font, size, spacing, margins, page breaks and fit-to-one-page for the resume on screen. */
export function LayoutPanel({ resume }: { resume: Resume }) {
  const updateResume = useResumeStore((s) => s.updateResume);
  const l = { ...DEFAULT_LAYOUT, ...resume.layout };
  // Layout changes are ordinary edits, so they can be undone.
  const set = (patch: Partial<Layout>) => updateResume((r) => ({ ...r, layout: { ...r.layout, ...patch } }));
  const breaks = new Set(l.pageBreakBefore);
  const sections = resume.sections.filter((s) => !s.hidden);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-semibold">Layout</p>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Template">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={l.template === t.id}
            onClick={() => set({ template: t.id })}
            className={`rounded-lg border p-2.5 text-left transition ${l.template === t.id ? "border-accent bg-accent-soft/60 ring-1 ring-accent/30" : "border-border hover:border-accent/50"}`}
          >
            <TemplateThumb id={t.id} />
            <span className="mt-1.5 block text-sm font-medium">{t.name}</span>
            <span className="block text-xs text-muted">{t.description}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Segmented label="Font" value={l.font} onChange={(font) => set({ font })} options={[{ value: "sans", label: "Sans" }, { value: "serif", label: "Serif" }]} />
        <Segmented label="Text size" value={l.size} onChange={(size) => set({ size })} options={[{ value: "small", label: "S" }, { value: "medium", label: "M" }, { value: "large", label: "L" }]} />
        <Segmented label="Spacing" value={l.spacing} onChange={(spacing) => set({ spacing })} options={[{ value: "tight", label: "Tight" }, { value: "normal", label: "Normal" }, { value: "relaxed", label: "Airy" }]} />
        <Segmented label="Margins" value={l.margins} onChange={(margins) => set({ margins })} options={[{ value: "narrow", label: "Narrow" }, { value: "normal", label: "Normal" }, { value: "wide", label: "Wide" }]} />
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={l.fitToOnePage} onChange={(e) => set({ fitToOnePage: e.target.checked })} />
        <span>
          <span className="font-medium">Fit to one page</span>
          <span className="block text-xs text-muted">Shrinks text and spacing a little (never below about 8pt) until everything fits.</span>
        </span>
      </label>

      {sections.length > 1 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted">Page breaks</summary>
          <ul className="mt-2 space-y-1">
            {sections.map((s, i) => (
              <li key={s.id}>
                <label className={`flex items-center gap-2 text-xs ${i === 0 ? "text-muted/60" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    disabled={i === 0}
                    checked={breaks.has(s.id)}
                    onChange={(e) => {
                      const next = new Set(breaks);
                      if (e.target.checked) next.add(s.id);
                      else next.delete(s.id);
                      set({ pageBreakBefore: [...next] });
                    }}
                  />
                  Start <span className="font-medium">{s.title || "Untitled"}</span> on a new page
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Tiny sketch of each template so the choice is visual. */
function TemplateThumb({ id }: { id: (typeof TEMPLATES)[number]["id"] }) {
  const center = id === "classic";
  const accent = id === "modern" ? "bg-blue-800" : "bg-neutral-800";
  const gap = id === "compact" ? "gap-0.5" : "gap-1";
  return (
    <span className={`flex h-14 flex-col ${gap} rounded border border-border bg-white p-1.5`} aria-hidden>
      <span className={`h-1.5 w-12 rounded-sm ${accent} ${center ? "mx-auto" : ""}`} />
      <span className={`h-0.5 w-16 rounded-sm bg-neutral-300 ${center ? "mx-auto" : ""}`} />
      {[0, 1].map((k) => (
        <span key={k} className={`flex flex-col ${gap}`}>
          <span className={`mt-0.5 h-1 w-8 rounded-sm ${accent} ${id === "modern" ? "" : "border-b border-neutral-400"}`} />
          <span className="h-0.5 w-full rounded-sm bg-neutral-200" />
          <span className="h-0.5 w-5/6 rounded-sm bg-neutral-200" />
        </span>
      ))}
    </span>
  );
}
