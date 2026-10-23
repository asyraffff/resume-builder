import type { Item, JobDescription, Resume, Section } from "../schemas";
import { contactHref, parseInline, plainText, tidyUrl, type Segment } from "../inline";

export const visibleSections = (r: Resume) =>
  r.sections.filter((s) => !s.hidden && s.items.some((it) => it.heading || it.subheading || it.bullets.some((b) => b.text.trim())));

/** Contact line entries; email and profile links are clickable, links are shown tidied. */
export function contactParts(r: Resume): { text: string; href: string | null }[] {
  const { email, phone, location, links } = r.contact;
  const parts = [
    { text: email.trim(), href: contactHref(email) },
    { text: phone.trim(), href: null },
    { text: location.trim(), href: null },
    ...links.map((l) => ({ text: tidyUrl(l), href: contactHref(tidyUrl(l)) })),
  ];
  return parts.filter((p) => p.text);
}

/** Contact line as plain text (used by tests and fallbacks). */
export const contactLine = (r: Resume) =>
  contactParts(r)
    .map((p) => p.text)
    .join("  |  ");

export type HeaderRow = { left: Segment[]; right: string; primary: boolean };

/** "Technical Lead, OCR Pipeline:" reads as a lead-in in the editor but looks stray as a header line. */
function withoutTrailingColon(segments: Segment[]): Segment[] {
  const last = segments.at(-1);
  if (!last || !/:\s*$/.test(last.text)) return segments;
  const text = last.text.replace(/\s*:\s*$/, "");
  return text ? [...segments.slice(0, -1), { ...last, text }] : segments.slice(0, -1);
}

/**
 * An entry's header as up to two rows: the role in bold with the dates on the right, then the organisation
 * with the location on the right. An entry with only one of heading/subheading gets a single bold row.
 */
export function itemHeaderRows(it: Item): HeaderRow[] {
  const head = withoutTrailingColon(parseInline(it.heading));
  const sub = withoutTrailingColon(parseInline(it.subheading));
  const dates = it.dates.trim();
  const location = it.location.trim();
  const first: HeaderRow = { left: head.length ? head : sub, right: dates, primary: true };
  const second: HeaderRow = { left: head.length ? sub : [], right: location, primary: false };
  if (!second.left.length && second.right && !first.right) return [{ ...first, right: location }];
  return [first, second].filter((r) => r.left.length || r.right);
}

/** Skills read best as one line per group: "Languages: TypeScript, Python". */
export const isInlineList = (s: Section) => s.type === "skills";
export function skillSegments(it: Item): Segment[] {
  const skills = it.bullets.map((b) => b.text.trim()).filter(Boolean);
  const list: Segment[] = skills.flatMap((s, i) => [...(i ? [{ text: ", " }] : []), ...parseInline(s)]);
  return it.heading.trim() ? [{ text: `${it.heading.trim()}: `, bold: true }, ...list] : list;
}
export const skillLine = (it: Item) => skillSegments(it).map((s) => s.text).join("");

/** All text that will appear in the export, to decide which script fonts are needed. */
export function exportText(r: Resume): string {
  return [
    r.contact.name,
    contactLine(r),
    r.summary,
    ...visibleSections(r).flatMap((s) => [s.title, ...s.items.flatMap((it) => [it.heading, it.subheading, it.location, it.dates, ...it.bullets.map((b) => b.text)])]),
  ].join("\n");
}

export function exportFileName(r: Resume, jd: JobDescription | null, ext: "pdf" | "docx") {
  const clean = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  const parts = [r.contact.name || "Resume", jd?.company, jd?.title].map((p) => clean(p ?? "")).filter(Boolean);
  return `${parts.join("_")}.${ext}`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Counts pages in a PDF made by the exporter (each page object carries "/Type /Page"). */
export async function countPdfPages(blob: Blob): Promise<number> {
  const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());
  return (text.match(/\/Type\s*\/Page(?![a-z])/g) ?? []).length;
}

/** Words a reader sees in the export (formatting markers and hidden sections excluded). */
export function countWords(r: Resume): number {
  return plainText(exportText(r)).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
