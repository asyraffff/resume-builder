import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import mammoth from "mammoth";
import JSZip from "jszip";
import { buildDocx } from "@/lib/export/docx";
import { buildPdf, renderPdf } from "@/lib/export/pdf";
import { fontPackage, scriptFallbacks } from "@/lib/export/fonts";
import { resolveLayout } from "@/lib/layout";
import { countWords, exportFileName } from "@/lib/export/shared";
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

/** Text pieces on page 1 with their position (PDF points, y measured up from the bottom) and width. */
async function positionedText(blob: Blob) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const content = await (await doc.getPage(1)).getTextContent();
  return content.items.flatMap((i) => ("str" in i && i.str.trim() ? [{ str: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width }] : []));
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
    for (const s of ["Alex Doe", "alex@example.com", "SUMMARY", "EXPERIENCE", "Software Engineer", "Acme", "Built things", "Languages: TypeScript"]) {
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

  it.each(["classic", "modern", "compact"] as const)("leaves a gap between the name and the contact line (%s)", async (template) => {
    const r = sampleResume();
    r.layout = { template };
    const items = await positionedText(await pdfOf(r));
    const spec = resolveLayout(r.layout);
    const name = items.find((i) => i.str.includes("Alex Doe"))!;
    const contact = items.find((i) => i.str.includes("alex@example.com"))!;
    // Bottom of the name's letters (descenders reach ~0.25 em below the baseline) stays above the top of the
    // contact line's letters (~0.75 em above its baseline), with at least 2pt between them.
    const nameBottom = name.y - 0.25 * spec.nameSize;
    const contactTop = contact.y + 0.75 * spec.metaSize;
    expect(nameBottom - contactTop).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("puts the role and the organisation on separate lines, with dates and location on the right", async () => {
    const items = await positionedText(await pdfOf(sampleResume()));
    const role = items.find((i) => i.str === "Software Engineer")!;
    const org = items.find((i) => i.str === "Acme")!;
    const dates = items.find((i) => i.str.includes("Present"))!;
    const location = items.find((i) => i.str === "Remote" && i.y < role.y)!;
    expect(org.y).toBeLessThan(role.y - 5); // organisation on the next line down
    expect(Math.abs(org.x - role.x)).toBeLessThan(1); // left-aligned with the role
    expect(Math.abs(dates.y - role.y)).toBeLessThan(2); // dates beside the role
    expect(Math.abs(location.y - org.y)).toBeLessThan(2); // location beside the organisation
    expect(Math.abs(location.x + location.w - (dates.x + dates.w))).toBeLessThan(1); // both right-aligned
  }, 30_000);

  it.each(["normal", "narrow", "wide"] as const)("keeps long titles clear of the dates, inside the %s margins", async (margins) => {
    const r = sampleResume();
    r.layout = { margins };
    r.sections[0].items[0] = {
      id: "long",
      heading: "Data Engineer / Backend Developer at Petroliam Nasional Berhad (Contract), Group Digital",
      subheading: "Technical Lead, CDF Integration · Backend Lead, OEIM Platform",
      location: "Kuala Lumpur",
      dates: "DEC 2025 – PRESENT",
      bullets: [{ id: "b", text: "Built things" }],
    };
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await (await pdfOf(r)).arrayBuffer()) }).promise;
    const page = await doc.getPage(1);
    const pageWidth = page.getViewport({ scale: 1 }).width;
    const items = (await page.getTextContent()).items.flatMap((i) => ("str" in i && i.str.trim() ? [{ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }] : []));
    const meta = items.find((i) => i.str.includes("PRESENT"))!;
    expect(meta).toBeDefined();
    // The dates stay inside the right margin.
    expect(meta.x + meta.w).toBeLessThanOrEqual(pageWidth - resolveLayout(r.layout).marginX + 1);
    // Nothing on the dates' line runs into them.
    const sameLine = items.filter((i) => i !== meta && Math.abs(i.y - meta.y) < 2);
    for (const i of sameLine) expect(i.x + i.w).toBeLessThan(meta.x);
    // The whole title is still there, wrapped onto more lines.
    const { text } = await pdfText(await pdfOf(r));
    // pdf.js joins wrapped lines without a space, so compare ignoring whitespace.
    expect(text.replace(/\s+/g, "")).toContain("BackendLead,OEIMPlatform");
  }, 30_000);
});

describe("Word export", () => {
  it("round-trips through a Word parser", async () => {
    const blob = await buildDocx(sampleResume());
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await blob.arrayBuffer()) });
    for (const s of ["Alex Doe", "SUMMARY", "Software Engineer", "Acme", "Built things", "Fixed bugs", "Languages: TypeScript"]) {
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

  it.each(["normal", "narrow", "wide"] as const)("right-aligns the dates to the %s margin", async (margins) => {
    const r = sampleResume();
    r.layout = { margins };
    const xml = await (await JSZip.loadAsync(await (await buildDocx(r)).arrayBuffer())).file("word/document.xml")!.async("string");
    const spec = resolveLayout(r.layout);
    const contentWidth = 11906 - 2 * Math.round(spec.marginX * 20); // A4 width in twentieths of a point
    expect(xml).toContain(`<w:tab w:val="right" w:pos="${contentWidth}"/>`);
  });
});

describe("file names", () => {
  it("builds a descriptive file name", () => {
    expect(exportFileName(sampleResume(), { company: "Acme Health", title: "Sr. Engineer" } as never, "pdf")).toBe("Alex_Doe_Acme_Health_Sr_Engineer.pdf");
    expect(exportFileName(sampleResume(), null, "docx")).toBe("Alex_Doe.docx");
  });
});

describe("word count", () => {
  it("counts visible words without formatting markers or hidden sections", () => {
    const r = sampleResume();
    const base = countWords(r);
    r.sections[0].items[0].bullets[0].text = "Built **fast** things for [Acme](https://acme.com)";
    expect(countWords(r)).toBe(base + 3); // "Built things" (2) -> "Built fast things for Acme" (5)
    r.sections[1].hidden = true;
    expect(countWords(r)).toBeLessThan(base + 3);
  });
});
