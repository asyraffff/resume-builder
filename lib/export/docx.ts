import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TabStopPosition,
  TabStopType,
  TextRun,
} from "docx";
import type { Resume } from "../schemas";
import { contactLine, isInlineList, itemMeta, itemTitle, skillLine, visibleSections } from "./shared";

const FONT = "Calibri";

const heading = (text: string) =>
  new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: { color: "999999", space: 1, style: BorderStyle.SINGLE, size: 6 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: FONT })],
  });

export async function buildDocx(r: Resume): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: r.contact.name, bold: true, size: 36, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: contactLine(r), size: 19, font: FONT })],
    }),
  ];

  if (r.summary.trim()) {
    children.push(heading("Summary"));
    children.push(new Paragraph({ children: [new TextRun({ text: r.summary, size: 20, font: FONT })] }));
  }

  for (const s of visibleSections(r)) {
    children.push(heading(s.title));
    for (const it of s.items) {
      if (isInlineList(s)) {
        children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: skillLine(it), size: 20, font: FONT })] }));
        continue;
      }
      const title = itemTitle(it);
      const meta = itemMeta(it);
      if (title || meta) {
        children.push(
          new Paragraph({
            spacing: { before: 100 },
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [
              new TextRun({ text: title, bold: true, size: 20, font: FONT }),
              ...(meta ? [new TextRun({ text: `\t${meta}`, size: 19, font: FONT })] : []),
            ],
          }),
        );
      }
      for (const b of it.bullets) {
        if (!b.text.trim()) continue;
        children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: b.text, size: 20, font: FONT })] }));
      }
    }
  }

  const doc = new Document({
    creator: r.contact.name || "Resume",
    title: `${r.contact.name} Resume`,
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 864, right: 864 } } }, children }],
  });
  return Packer.toBlob(doc);
}
