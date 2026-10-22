import type { Item, Resume, Section } from "./schemas";
import { plainResume } from "./inline";

/** Before/after comparison of two versions of a resume, matched by section, entry and bullet ids. */

export type Token = { type: "same" | "add" | "del"; text: string };

/**
 * Word-level diff (longest common subsequence over words). Each token keeps its trailing space but words are
 * compared without it, so a change reads as whole phrases instead of fragments around shared spaces.
 */
export function wordDiff(before: string, after: string): Token[] {
  const a = before.match(/\S+\s*/g) ?? [];
  const b = after.match(/\S+\s*/g) ?? [];
  const eq = (x: string, y: string) => x.trimEnd() === y.trimEnd();
  // Bullets are short, so the O(n·m) table is fine; guard against pathological inputs anyway.
  if (a.length * b.length > 250_000) return [{ type: "del", text: before }, { type: "add", text: after }];
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out: Token[] = [];
  const push = (type: Token["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (eq(a[i], b[j])) {
      push("same", b[j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", a[i++]);
    else push("add", b[j++]);
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return out;
}

export type Kind = "same" | "changed" | "added" | "removed";

export type BulletDiff = { id: string; kind: Kind; before: string; after: string };

export type ItemDiff = {
  id: string;
  kind: Kind;
  before: Pick<Item, "heading" | "subheading" | "dates" | "location"> | null;
  after: Pick<Item, "heading" | "subheading" | "dates" | "location"> | null;
  bullets: BulletDiff[];
};

export type SectionDiff = { id: string; kind: Kind; titleBefore: string; titleAfter: string; hidden: boolean; items: ItemDiff[] };

export type ResumeDiff = {
  summary: { before: string; after: string; changed: boolean };
  sections: SectionDiff[];
  counts: { rewritten: number; added: number; removed: number; renamed: number };
  total: number;
};

const header = (it: Item) => ({ heading: it.heading, subheading: it.subheading, dates: it.dates, location: it.location });
const sameHeader = (a: Item, b: Item) => a.heading === b.heading && a.subheading === b.subheading && a.dates === b.dates && a.location === b.location;
const clean = (s: string) => s.trim();

function diffBullets(before: Item | undefined, after: Item | undefined): BulletDiff[] {
  const prev = new Map((before?.bullets ?? []).map((b) => [b.id, b.text]));
  const out: BulletDiff[] = [];
  for (const b of after?.bullets ?? []) {
    if (!clean(b.text) && !prev.has(b.id)) continue; // an empty new bullet isn't a change worth showing
    const old = prev.get(b.id);
    if (old === undefined) out.push({ id: b.id, kind: "added", before: "", after: b.text });
    else out.push({ id: b.id, kind: clean(old) === clean(b.text) ? "same" : "changed", before: old, after: b.text });
  }
  const kept = new Set((after?.bullets ?? []).map((b) => b.id));
  for (const b of before?.bullets ?? []) if (!kept.has(b.id) && clean(b.text)) out.push({ id: b.id, kind: "removed", before: b.text, after: "" });
  return out;
}

function diffItems(before: Section | undefined, after: Section | undefined): ItemDiff[] {
  const prev = new Map((before?.items ?? []).map((it) => [it.id, it]));
  const out: ItemDiff[] = [];
  for (const it of after?.items ?? []) {
    const old = prev.get(it.id);
    const bullets = diffBullets(old, it);
    if (!old) out.push({ id: it.id, kind: "added", before: null, after: header(it), bullets: bullets.map((b) => ({ ...b, kind: "added" })) });
    else {
      const changed = !sameHeader(old, it) || bullets.some((b) => b.kind !== "same");
      out.push({ id: it.id, kind: changed ? "changed" : "same", before: header(old), after: header(it), bullets });
    }
  }
  const kept = new Set((after?.items ?? []).map((it) => it.id));
  for (const it of before?.items ?? []) {
    if (kept.has(it.id)) continue;
    out.push({ id: it.id, kind: "removed", before: header(it), after: null, bullets: diffBullets(it, undefined) });
  }
  return out;
}

export function compareResumes(originalFormatted: Resume, tailoredFormatted: Resume): ResumeDiff {
  // Compare wording; formatting-only changes (bold, links) aren't counted as edits.
  const original = plainResume(originalFormatted);
  const tailored = plainResume(tailoredFormatted);
  const prev = new Map(original.sections.map((s) => [s.id, s]));
  const sections: SectionDiff[] = [];
  for (const s of tailored.sections) {
    const old = prev.get(s.id);
    const items = diffItems(old, s);
    const kind: Kind = !old ? "added" : old.title !== s.title || items.some((i) => i.kind !== "same") ? "changed" : "same";
    sections.push({ id: s.id, kind, titleBefore: old?.title ?? "", titleAfter: s.title, hidden: s.hidden, items });
  }
  const kept = new Set(tailored.sections.map((s) => s.id));
  for (const s of original.sections) {
    if (!kept.has(s.id)) sections.push({ id: s.id, kind: "removed", titleBefore: s.title, titleAfter: "", hidden: false, items: diffItems(s, undefined) });
  }

  const counts = { rewritten: 0, added: 0, removed: 0, renamed: 0 };
  const summaryChanged = clean(original.summary) !== clean(tailored.summary);
  if (summaryChanged) counts.rewritten++;
  for (const s of sections) {
    if (s.kind === "added") counts.added++;
    else if (s.kind === "removed") counts.removed++;
    else if (s.titleBefore !== s.titleAfter) counts.renamed++;
    if (s.kind === "added" || s.kind === "removed") continue; // counted once for the whole section
    for (const it of s.items) {
      if (it.kind === "added") counts.added++;
      else if (it.kind === "removed") counts.removed++;
      else {
        if (it.before && it.after && JSON.stringify(it.before) !== JSON.stringify(it.after)) counts.rewritten++;
        for (const b of it.bullets) {
          if (b.kind === "changed") counts.rewritten++;
          else if (b.kind === "added") counts.added++;
          else if (b.kind === "removed") counts.removed++;
        }
      }
    }
  }

  return {
    summary: { before: original.summary, after: tailored.summary, changed: summaryChanged },
    sections,
    counts,
    total: counts.rewritten + counts.added + counts.removed + counts.renamed,
  };
}
