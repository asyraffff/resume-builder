import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import mammoth from "mammoth";
import JSZip from "jszip";
import { buildDocx } from "@/lib/export/docx";
import { buildPdf, renderPdf } from "@/lib/export/pdf";
import { fontPackage, scriptFallbacks } from "@/lib/export/fonts";
import { exportFileName } from "@/lib/export/shared";
import type { Resume } from "@/lib/schemas";
import { sampleResume } from "./fixtures";

// In tests the fonts are read straight from node_modules instead of the app's /fonts folder.
const require = createRequire(import.meta.url);
const fontUrl = (file: string) => require.resolve(fontPackage(file));
const pdfOf = (r: Resume) => buildPdf(r, { fontUrl });

async function pdfText(blob: Blob) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((i) => ("str" in i ? i.str : "")).join("") + "\n";
  }
  return { text, pages: doc.numPages };
}

async function pdfLinks(blob: Blob) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const links: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    for (const a of await (await doc.getPage(p)).getAnnotations()) if (a.url) links.push(a.url);
  }
  return links;
}

const longResume = () => {
  const r = sampleResume();
  r.sections[0].items = Array.from({ length: 6 }, (_, i) => ({
    id: `j${i}`,
    heading: `Engineer ${i}`,
    subheading: "Acme",
    dates: "2020 – 2022",
    location: "Remote",
    bullets: Array.from({ length: 5 }, (_, k) => ({ id: `b${i}-${k}`, text: "Delivered a measurable improvement to a production system used by many teams across the company." })),
  }));
  return r;
};

describe("PDF export", () => {
  it("contains selectable text in reading order, and hides hidden sections", async () => {
    const r = sampleResume();
    r.sections.push({ id: "h", type: "custom", title: "Secret", hidden: true, items: [{ id: "hi", heading: "Hidden item", subheading: "", dates: "", location: "", bullets: [] }] });
    const { text } = await pdfText(await pdfOf(r));
    for (const s of ["Alex Doe", "alex@example.com", "SUMMARY", "EXPERIENCE", "Software Engineer, Acme", "Built things", "Languages: TypeScript"]) {
      expect(text).toContain(s);
    }
    expect(text.indexOf("EXPERIENCE")).toBeLessThan(text.indexOf("SKILLS"));
    expect(text).not.toContain("Hidden item");
  }, 30_000);

  it("renders Chinese and Tamil text as real, extractable characters", async () => {
    const r = sampleResume();
    r.contact.name = "李明 Alex";
    r.sections[0].items[0].bullets[0].text = "Built a search tool for தமிழ் and 中文 users";
    expect(scriptFallbacks(r.contact.name + r.sections[0].items[0].bullets[0].text)).toEqual(["NotoSansSC", "NotoSansTamil"]);
    const { text } = await pdfText(await pdfOf(r));
    expect(text).toContain("李明");
    expect(text).toContain("中文");
    expect(text).toMatch(/த.*ம.*ழ/); // Tamil shaping may reorder glyph runs, so check the letters are there
  }, 30_000);

  it("makes contact links and inline links clickable, and drops formatting markers", async () => {
    const r = sampleResume();
    r.contact.links = ["https://www.linkedin.com/in/alex-doe/?trk=x"];
    r.sections[0].items[0].bullets[0].text = "Built **fast** things for [Acme](https://acme.com)";
    const blob = await pdfOf(r);
    const { text } = await pdfText(blob);
    expect(text).toContain("linkedin.com/in/alex-doe");
    expect(text).toContain("Built fast things for Acme");
    expect(text).not.toContain("**");
    // The PDF reader normalises bare hosts to "https://acme.com/".
    expect(await pdfLinks(blob)).toEqual(expect.arrayContaining(["mailto:alex@example.com", "https://linkedin.com/in/alex-doe", "https://acme.com/"]));
  }, 30_000);

  it("starts a section on a new page when asked", async () => {
    const r = sampleResume();
    r.layout = { pageBreakBefore: ["skills"] };
    const { text, pages } = await pdfText(await pdfOf(r));
    expect(pages).toBe(2);
    expect(text.split("\n")[1]).toContain("SKILLS");
  }, 30_000);

  it("fits a long resume onto one page, and reports when it can't", async () => {
    const r = longResume();
    expect((await renderPdf(r, { fontUrl })).pages).toBe(2);
    r.layout = { fitToOnePage: true };
    const fitted = await renderPdf(r, { fontUrl });
    expect(fitted.pages).toBe(1);
    expect(fitted.fitted).toBe(true);
    expect(fitted.scale).toBeLessThan(1);

    const huge = longResume();
    huge.sections[0].items = [...huge.sections[0].items, ...longResume().sections[0].items.map((it) => ({ ...it, id: it.id + "x" }))];
    huge.layout = { fitToOnePage: true };
    const tooBig = await renderPdf(huge, { fontUrl });
    expect(tooBig.fitted).toBe(false);
    expect(tooBig.pages).toBeGreaterThan(1);
  }, 60_000);

  it.each(["classic", "modern", "compact"] as const)("renders the %s template with the serif font", async (template) => {
    const r = sampleResume();
    r.layout = { template, font: "serif", size: "large", spacing: "relaxed", margins: "wide" };
    const { text } = await pdfText(await pdfOf(r));
    expect(text).toContain("Alex Doe");
    expect(text).toContain("Built things");
  }, 30_000);
});

describe("Word export", () => {
  it("round-trips through a Word parser", async () => {
    const blob = await buildDocx(sampleResume());
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await blob.arrayBuffer()) });
    for (const s of ["Alex Doe", "SUMMARY", "Software Engineer, Acme", "Built things", "Fixed bugs", "Languages: TypeScript"]) {
      expect(value).toContain(s);
    }
  });

  it("keeps bold, links, real bullet lists, page breaks and the chosen font", async () => {
    const r = sampleResume();
    r.contact.links = ["linkedin.com/in/alex-doe"];
    r.sections[0].items[0].bullets[0].text = "Built **fast** things for [Acme](https://acme.com)";
    r.layout = { font: "serif", pageBreakBefore: ["skills"] };
    const zip = await JSZip.loadAsync(await (await buildDocx(r)).arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(xml).toMatch(/<w:b\/>[\s\S]*?fast/);
    expect(xml).not.toContain("**");
    expect(xml).toContain("<w:hyperlink");
    expect(rels).toContain("https://acme.com");
    expect(rels).toContain("https://linkedin.com/in/alex-doe");
    expect(rels).toContain("mailto:alex@example.com");
    expect(xml).toContain("<w:numPr>");
    expect(xml).toContain("<w:pageBreakBefore/>");
    expect(xml).toContain('w:ascii="Cambria"');
  });
});

describe("file names", () => {
  it("builds a descriptive file name", () => {
    expect(exportFileName(sampleResume(), { company: "Acme Health", title: "Sr. Engineer" } as never, "pdf")).toBe("Alex_Doe_Acme_Health_Sr_Engineer.pdf");
    expect(exportFileName(sampleResume(), null, "docx")).toBe("Alex_Doe.docx");
  });
});
