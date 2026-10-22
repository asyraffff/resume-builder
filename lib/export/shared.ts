import type { Item, JobDescription, Resume, Section } from "../schemas";
import { contactHref, parseInline, tidyUrl, type Segment } from "../inline";

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

/** "Senior Engineer, Acme" / "Acme" / "Senior Engineer", as formatted segments. */
export function itemTitleSegments(it: Item): Segment[] {
  const head = parseInline(it.heading);
  const sub = parseInline(it.subheading);
  if (head.length && sub.length) return [...head, { text: ", " }, ...sub];
  return head.length ? head : sub;
}
export const itemTitle = (it: Item) => itemTitleSegments(it).map((s) => s.text).join("");
export const itemMeta = (it: Item) => [it.location, it.dates].map((x) => x.trim()).filter(Boolean).join("  |  ");

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
