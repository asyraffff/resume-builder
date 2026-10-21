import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { buildDocx } from "@/lib/export/docx";
import { buildPdf } from "@/lib/export/pdf";
import { exportFileName } from "@/lib/export/shared";
import { sampleResume } from "./fixtures";

async function pdfText(blob: Blob) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
  }
  return text;
}

describe("exports", () => {
  it("PDF contains selectable text in reading order, and hides hidden sections", async () => {
    const r = sampleResume();
    r.sections.push({ id: "h", type: "custom", title: "Secret", hidden: true, items: [{ id: "hi", heading: "Hidden item", subheading: "", dates: "", location: "", bullets: [] }] });
    const text = await pdfText(await buildPdf(r));
    for (const s of ["Alex Doe", "alex@example.com", "SUMMARY", "EXPERIENCE", "Software Engineer, Acme", "Built things", "Languages: TypeScript"]) {
      expect(text).toContain(s);
    }
    expect(text.indexOf("EXPERIENCE")).toBeLessThan(text.indexOf("SKILLS"));
    expect(text).not.toContain("Hidden item");
  }, 30_000);

  it("DOCX round-trips through a Word parser", async () => {
    const blob = await buildDocx(sampleResume());
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await blob.arrayBuffer()) });
    for (const s of ["Alex Doe", "SUMMARY", "Software Engineer, Acme", "Built things", "Fixed bugs", "Languages: TypeScript"]) {
      expect(value).toContain(s);
    }
  });

  it("builds a descriptive file name", () => {
    expect(exportFileName(sampleResume(), { company: "Acme Health", title: "Sr. Engineer" } as never, "pdf")).toBe("Alex_Doe_Acme_Health_Sr_Engineer.pdf");
    expect(exportFileName(sampleResume(), null, "docx")).toBe("Alex_Doe.docx");
  });
});
