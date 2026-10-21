"use client";

import { newId } from "@/lib/ids";
import type { Item } from "@/lib/schemas";
import { InlineEditable } from "./InlineEditable";
import { DeleteButton } from "./controls";

/** A skills group rendered as one inline, comma-separated line. */
export function SkillsItem({
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
