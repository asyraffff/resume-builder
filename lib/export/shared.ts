import type { Item, JobDescription, Resume, Section } from "../schemas";

export const visibleSections = (r: Resume) =>
  r.sections.filter((s) => !s.hidden && s.items.some((it) => it.heading || it.subheading || it.bullets.length));

export const contactLine = (r: Resume) =>
  [r.contact.email, r.contact.phone, r.contact.location, ...r.contact.links].map((x) => x.trim()).filter(Boolean).join("  |  ");

/** "Senior Engineer, Acme" / "Acme" / "Senior Engineer" */
export const itemTitle = (it: Item) => [it.heading, it.subheading].filter(Boolean).join(", ");
export const itemMeta = (it: Item) => [it.location, it.dates].filter(Boolean).join("  |  ");

/** Skills read best as one line per group: "Languages: TypeScript, Python". */
export const isInlineList = (s: Section) => s.type === "skills";
export const skillLine = (it: Item) => {
  const list = it.bullets.map((b) => b.text.trim()).filter(Boolean).join(", ");
  return it.heading ? `${it.heading}: ${list}` : list;
};

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
