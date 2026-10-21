"use client";

import { useEffect, useState } from "react";
import { useResumeStore } from "@/store/resume-store";
import { newId } from "@/lib/ids";
import { SECTION_TYPES, type Item, type Resume, type Section } from "@/lib/schemas";
import { InlineEditable } from "./InlineEditable";
import { DragHandle, SortableList, SortableRow } from "./Sortable";

const emptyItem = (): Item => ({ id: newId(), heading: "", subheading: "", dates: "", location: "", bullets: [{ id: newId(), text: "" }] });

const DEFAULT_TITLES: Record<Section["type"], string> = {
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  certifications: "Certifications",
  custom: "Additional",
};

export function ResumeEditor({ highlight }: { highlight?: Set<string> }) {
  const resume = useResumeStore((s) => s.resume);
  const updateResume = useResumeStore((s) => s.updateResume);
  const undo = useResumeStore((s) => s.undo);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ label: string; after: Resume } | null>(null);

  // The toast's Undo is only safe while the deletion is the latest change; hide it after any other edit or a few seconds.
  useEffect(() => {
    if (!toast) return;
    if (resume !== toast.after) {
      setToast(null);
      return;
    }
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast, resume]);

  if (!resume) return null;

  const set = (fn: (r: Resume) => Resume, key?: string) => updateResume(fn, key);
  const setSection = (id: string, fn: (s: Section) => Section, key?: string) =>
    set((r) => ({ ...r, sections: r.sections.map((s) => (s.id === id ? fn(s) : s)) }), key);
  const setItem = (sid: string, iid: string, fn: (it: Item) => Item, key?: string) =>
    setSection(sid, (s) => ({ ...s, items: s.items.map((it) => (it.id === iid ? fn(it) : it)) }), key);

  const remove = (label: string, fn: (r: Resume) => Resume) => {
    set(fn);
    const after = useResumeStore.getState().resume;
    if (after) setToast({ label, after });
  };
  const removeItem = (sid: string, iid: string, label: string) =>
    remove(label, (r) => ({ ...r, sections: r.sections.map((s) => (s.id === sid ? { ...s, items: s.items.filter((x) => x.id !== iid) } : s)) }));
  const removeBullet = (sid: string, iid: string, bid: string, label: string) =>
    remove(label, (r) => ({
      ...r,
      sections: r.sections.map((s) =>
        s.id === sid ? { ...s, items: s.items.map((it) => (it.id === iid ? { ...it, bullets: it.bullets.filter((b) => b.id !== bid) } : it)) } : s,
      ),
    }));

  const c = resume.contact;
  const setContact = (field: keyof Omit<typeof c, "links">) => (v: string) =>
    set((r) => ({ ...r, contact: { ...r.contact, [field]: v } }), `contact.${field}`);

  return (
    <div className="mx-auto w-full max-w-[820px] rounded-sm bg-white px-6 py-8 text-[14px] leading-relaxed text-neutral-900 shadow-sm ring-1 ring-border sm:px-12 sm:py-10">
      {/* Header */}
      <div className="text-center">
        <InlineEditable as="div" value={c.name} onChange={setContact("name")} placeholder="Your name" className="text-2xl font-bold" />
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] text-neutral-600">
          <InlineEditable value={c.email} onChange={setContact("email")} placeholder="email" />
          <span aria-hidden>|</span>
          <InlineEditable value={c.phone} onChange={setContact("phone")} placeholder="phone" />
          <span aria-hidden>|</span>
          <InlineEditable value={c.location} onChange={setContact("location")} placeholder="location" />
          {c.links.map((l, i) => (
            <span key={i} className="group/link flex items-center gap-2">
              <span aria-hidden>|</span>
              <InlineEditable
                value={l}
                placeholder="link"
                onChange={(v) => set((r) => ({ ...r, contact: { ...r.contact, links: r.contact.links.map((x, j) => (j === i ? v : x)) } }), `link.${i}`)}
                onBackspaceEmpty={() => set((r) => ({ ...r, contact: { ...r.contact, links: r.contact.links.filter((_, j) => j !== i) } }))}
              />
              <DeleteButton
                reveal="link"
                size="sm"
                label="Delete link"
                className="-ml-1.5"
                onClick={() => remove("Link deleted", (r) => ({ ...r, contact: { ...r.contact, links: r.contact.links.filter((_, j) => j !== i) } }))}
              />
            </span>
          ))}
          <button
            className="rounded px-1 text-xs text-accent hover:bg-accent-soft"
            onClick={() => set((r) => ({ ...r, contact: { ...r.contact, links: [...r.contact.links, ""] } }))}
          >
            + link
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className={`mt-5 rounded ${highlight?.has("summary") ? "bg-green-50" : ""}`}>
        <h3 className="border-b border-neutral-300 pb-0.5 text-[13px] font-bold tracking-wide">SUMMARY</h3>
        <InlineEditable
          as="p"
          multiline
          value={resume.summary}
          onChange={(v) => set((r) => ({ ...r, summary: v }), "summary")}
          placeholder="A 2–3 sentence professional summary tailored to the role"
          className="mt-1.5 block"
        />
      </div>

      {/* Sections */}
      <SortableList items={resume.sections} onReorder={(sections) => set((r) => ({ ...r, sections }))}>
        {resume.sections.map((sec) => (
          <SortableRow key={sec.id} id={sec.id} className="group/section mt-5">
            {(handle) => (
              <div className={sec.hidden ? "opacity-40" : ""}>
                <div className="-ml-7 flex items-center gap-2 border-b border-neutral-300 pb-0.5">
                  <DragHandle handle={handle} label={`Reorder section ${sec.title}`} />
                  <InlineEditable
                    value={sec.title}
                    onChange={(v) => setSection(sec.id, (s) => ({ ...s, title: v }), `title.${sec.id}`)}
                    placeholder="Section title"
                    className="text-[13px] font-bold uppercase tracking-wide"
                  />
                  {sec.hidden && <span className="text-xs text-muted">(hidden from export)</span>}
                  <div className="ml-auto flex gap-1 opacity-0 transition group-hover/section:opacity-100 focus-within:opacity-100">
                    <ToolButton onClick={() => setSection(sec.id, (s) => ({ ...s, items: [...s.items, emptyItem()] }))}>+ entry</ToolButton>
                    <ToolButton onClick={() => setSection(sec.id, (s) => ({ ...s, hidden: !s.hidden }))}>{sec.hidden ? "Show" : "Hide"}</ToolButton>
                  </div>
                  <DeleteButton
                    reveal="section"
                    label={`Delete section ${sec.title}`}
                    onClick={() => remove(`"${sec.title || "Untitled"}" section deleted`, (r) => ({ ...r, sections: r.sections.filter((s) => s.id !== sec.id) }))}
                  />
                </div>

                <SortableList items={sec.items} onReorder={(items) => setSection(sec.id, (s) => ({ ...s, items }))}>
                  {sec.items.map((it) => (
                    <SortableRow key={it.id} id={it.id} className="group/item mt-2">
                      {(itemHandle) => (
                        <div className="-ml-7 flex gap-2">
                          <DragHandle handle={itemHandle} label={`Reorder entry ${it.heading || "untitled"}`} />
                          <div className="min-w-0 flex-1">
                            {sec.type === "skills" ? (
                              <SkillsItem
                                item={it}
                                highlight={highlight}
                                onChange={(fn, key) => setItem(sec.id, it.id, fn, key)}
                                onDelete={() => removeItem(sec.id, it.id, "Skill group deleted")}
                                onDeleteSkill={(bid) => removeBullet(sec.id, it.id, bid, "Skill deleted")}
                              />
                            ) : (
                              <>
                                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                                  <div className="font-semibold">
                                    <InlineEditable value={it.heading} onChange={(v) => setItem(sec.id, it.id, (x) => ({ ...x, heading: v }), `h.${it.id}`)} placeholder="Title / degree / project" />
                                    <span className="font-normal">{it.heading && it.subheading ? ", " : " "}</span>
                                    <InlineEditable value={it.subheading} onChange={(v) => setItem(sec.id, it.id, (x) => ({ ...x, subheading: v }), `sh.${it.id}`)} placeholder="Company / school" className="font-normal" />
                                  </div>
                                  <div className="flex items-center gap-1 text-[13px] text-neutral-600">
                                    <InlineEditable value={it.location} onChange={(v) => setItem(sec.id, it.id, (x) => ({ ...x, location: v }), `loc.${it.id}`)} placeholder="location" />
                                    <span aria-hidden>|</span>
                                    <InlineEditable value={it.dates} onChange={(v) => setItem(sec.id, it.id, (x) => ({ ...x, dates: v }), `d.${it.id}`)} placeholder="dates" />
                                    <DeleteButton reveal="item" label={`Delete entry ${it.heading || "untitled"}`} className="ml-1" onClick={() => removeItem(sec.id, it.id, "Entry deleted")} />
                                  </div>
                                </div>

                                <SortableList items={it.bullets} onReorder={(bullets) => setItem(sec.id, it.id, (x) => ({ ...x, bullets }))}>
                                  <ul className="mt-0.5">
                                    {it.bullets.map((b, bi) => (
                                      <SortableRow key={b.id} id={b.id} className="group/bullet">
                                        {(bh) => (
                                          <li className={`-ml-1 flex items-start gap-1 rounded ${highlight?.has(b.id) ? "bg-green-50" : ""}`}>
                                            <span className="opacity-0 group-hover/bullet:opacity-100"><DragHandle handle={bh} label="Reorder bullet" /></span>
                                            <span className="select-none pt-px" aria-hidden>•</span>
                                            <InlineEditable
                                              multiline
                                              autoFocus={focusId === b.id}
                                              value={b.text}
                                              placeholder="Describe an achievement…"
                                              className="flex-1"
                                              onChange={(v) => setItem(sec.id, it.id, (x) => ({ ...x, bullets: x.bullets.map((y) => (y.id === b.id ? { ...y, text: v } : y)) }), `b.${b.id}`)}
                                              onEnter={() => {
                                                const id = newId();
                                                setItem(sec.id, it.id, (x) => {
                                                  const bullets = [...x.bullets];
                                                  bullets.splice(bi + 1, 0, { id, text: "" });
                                                  return { ...x, bullets };
                                                });
                                                setFocusId(id);
                                              }}
                                              onBackspaceEmpty={() => {
                                                const prev = it.bullets[bi - 1];
                                                setItem(sec.id, it.id, (x) => ({ ...x, bullets: x.bullets.filter((y) => y.id !== b.id) }));
                                                setFocusId(prev?.id ?? null);
                                              }}
                                            />
                                            <DeleteButton reveal="bullet" size="sm" label="Delete bullet" className="mt-0.5" onClick={() => removeBullet(sec.id, it.id, b.id, "Bullet deleted")} />
                                          </li>
                                        )}
                                      </SortableRow>
                                    ))}
                                  </ul>
                                </SortableList>
                                <button
                                  className="ml-6 text-xs text-accent opacity-0 hover:underline group-hover/item:opacity-100 focus:opacity-100"
                                  onClick={() => {
                                    const id = newId();
                                    setItem(sec.id, it.id, (x) => ({ ...x, bullets: [...x.bullets, { id, text: "" }] }));
                                    setFocusId(id);
                                  }}
                                >
                                  + bullet
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </SortableRow>
                  ))}
                </SortableList>
              </div>
            )}
          </SortableRow>
        ))}
      </SortableList>

      <AddSection onAdd={(type) => set((r) => ({ ...r, sections: [...r.sections, { id: newId(), type, title: DEFAULT_TITLES[type], hidden: false, items: [emptyItem()] }] }))} />

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm text-white shadow-lg"
        >
          <span>{toast.label}</span>
          <button
            className="font-semibold text-blue-300 hover:text-blue-200"
            onClick={() => {
              undo();
              setToast(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

function SkillsItem({
  item,
  highlight,
  onChange,
  onDelete,
  onDeleteSkill,
}: {
  item: Item;
  highlight?: Set<string>;
  onChange: (fn: (it: Item) => Item, key?: string) => void;
  onDelete: () => void;
  onDeleteSkill: (bulletId: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1">
      <span className="font-semibold">
        <InlineEditable value={item.heading} onChange={(v) => onChange((x) => ({ ...x, heading: v }), `h.${item.id}`)} placeholder="Group (optional)" />:
      </span>
      {item.bullets.map((b, i) => (
        <span key={b.id} className={`group/skill inline-flex items-baseline rounded ${highlight?.has(b.id) ? "bg-green-50" : ""}`}>
          <InlineEditable
            value={b.text}
            placeholder="skill"
            onChange={(v) => onChange((x) => ({ ...x, bullets: x.bullets.map((y) => (y.id === b.id ? { ...y, text: v } : y)) }), `b.${b.id}`)}
            onBackspaceEmpty={() => onChange((x) => ({ ...x, bullets: x.bullets.filter((y) => y.id !== b.id) }))}
          />
          <DeleteButton reveal="skill" size="sm" label={`Delete skill ${b.text || "empty"}`} className="self-center" onClick={() => onDeleteSkill(b.id)} />
          {i < item.bullets.length - 1 && ","}
        </span>
      ))}
      <button className="text-xs text-accent hover:underline" onClick={() => onChange((x) => ({ ...x, bullets: [...x.bullets, { id: newId(), text: "" }] }))}>
        + skill
      </button>
      <DeleteButton reveal="item" label="Delete skill group" className="ml-auto self-center" onClick={onDelete} />
    </div>
  );
}

function AddSection({ onAdd }: { onAdd: (t: Section["type"]) => void }) {
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

function ToolButton({ danger, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      {...props}
      className={`rounded px-1.5 py-0.5 text-xs font-normal normal-case tracking-normal ${danger ? "text-muted hover:bg-red-50 hover:text-bad" : "text-muted hover:bg-background hover:text-foreground"} ${className}`}
    />
  );
}

// Literal class strings so Tailwind generates them. Touch screens have no hover, so buttons stay visible there.
const REVEAL = {
  section: "group-hover/section:opacity-100",
  item: "group-hover/item:opacity-100",
  bullet: "group-hover/bullet:opacity-100",
  skill: "group-hover/skill:opacity-100",
  link: "group-hover/link:opacity-100",
} as const;

/** Trash button for one block: appears on hover or keyboard focus. */
function DeleteButton({
  label,
  onClick,
  reveal,
  size = "md",
  className = "",
}: {
  label: string;
  onClick: () => void;
  reveal: keyof typeof REVEAL;
  size?: "sm" | "md";
  className?: string;
}) {
  const box = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const icon = size === "sm" ? 12 : 14;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded text-neutral-400 opacity-0 transition hover:bg-red-50 hover:text-bad focus-visible:opacity-100 [@media(hover:none)]:opacity-60 ${REVEAL[reveal]} ${box} ${className}`}
    >
      <svg width={icon} height={icon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.75 7v4M9.25 7v4" />
      </svg>
    </button>
  );
}
