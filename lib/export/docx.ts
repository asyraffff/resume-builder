import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  LevelFormat,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
  type ParagraphChild,
} from "docx";
import type { Resume } from "../schemas";
import { parseInline, type Segment } from "../inline";
import { resolveLayout, type LayoutSpec } from "../layout";
import { contactParts, isInlineList, itemHeaderRows, skillSegments, visibleSections } from "./shared";

// Word substitutes fonts per character from the system, so standard Office fonts cover every language.
const WORD_FONT = { sans: "Calibri", serif: "Cambria" } as const;

const pt = (n: number) => Math.round(n * 2); // docx sizes are half-points
const twip = (n: number) => Math.round(n * 20); // spacing and margins are twentieths of a point
const A4_WIDTH = 11906; // A4 is 210 x 297 mm: 11906 x 16838 twentieths of a point
const A4_HEIGHT = 16838;

function runs(segments: Segment[], spec: LayoutSpec, size: number, extra: { bold?: boolean; color?: string } = {}): ParagraphChild[] {
  const font = WORD_FONT[spec.font];
  return segments.map((s) => {
    const run = new TextRun({
      text: s.text,
      bold: extra.bold || s.bold,
      italics: s.italic,
      size: pt(size),
      font,
      color: s.href ? "1A4FBF" : extra.color,
    });
    return s.href ? new ExternalHyperlink({ link: s.href, children: [run] }) : run;
  });
}

function heading(text: string, spec: LayoutSpec, pageBreakBefore = false) {
  return new Paragraph({
    pageBreakBefore,
    keepNext: true,
    spacing: { before: twip(spec.sectionGap), after: twip(3) },
    border: spec.headingRule ? { bottom: { color: "9A9A9A", space: 1, style: BorderStyle.SINGLE, size: 6 } } : undefined,
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: pt(spec.headingSize),
        font: WORD_FONT[spec.font],
        color: spec.accent.replace("#", ""),
        characterSpacing: spec.template === "modern" ? 16 : 6,
      }),
    ],
  });
}

export async function buildDocx(r: Resume): Promise<Blob> {
  const spec = resolveLayout(r.layout);
  const font = WORD_FONT[spec.font];
  const line = Math.round(240 * spec.lineHeight * 0.9); // Word's "single" already includes some leading
  const align = spec.nameAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;

  const contact = contactParts(r).flatMap((p, i): ParagraphChild[] => {
    const sep = i > 0 ? [new TextRun({ text: "  |  ", size: pt(spec.metaSize), font, color: "333333" })] : [];
    const run = new TextRun({ text: p.text, size: pt(spec.metaSize), font, color: p.href ? "1A4FBF" : "333333" });
    return [...sep, p.href ? new ExternalHyperlink({ link: p.href, children: [run] }) : run];
  });

  const children: Paragraph[] = [
    new Paragraph({
      alignment: align,
      children: [
        new TextRun({
          text: r.contact.name,
          bold: true,
          size: pt(spec.nameSize),
          font,
          color: spec.template === "modern" ? spec.accent.replace("#", "") : undefined,
        }),
      ],
    }),
    new Paragraph({ alignment: align, spacing: { before: twip(3) }, children: contact }),
  ];

  if (r.summary.trim()) {
    children.push(heading("Summary", spec));
    children.push(new Paragraph({ spacing: { line }, children: runs(parseInline(r.summary), spec, spec.fontSize) }));
  }

  for (const s of visibleSections(r)) {
    children.push(heading(s.title, spec, spec.pageBreakBefore.has(s.id)));
    for (const it of s.items) {
      if (isInlineList(s)) {
        children.push(new Paragraph({ spacing: { after: twip(2), line }, children: runs(skillSegments(it), spec, spec.fontSize) }));
        continue;
      }
      itemHeaderRows(it).forEach((row, i) => {
        children.push(
          new Paragraph({
            keepNext: true,
            spacing: { before: twip(i === 0 ? spec.itemGap : 1), line },
            // Right edge of the text area for this resume's margins (TabStopPosition.MAX assumes 1-inch margins).
            tabStops: [{ type: TabStopType.RIGHT, position: A4_WIDTH - 2 * twip(spec.marginX) }],
            children: [
              ...runs(row.left, spec, spec.fontSize, row.primary ? { bold: true } : { color: "333333" }),
              ...(row.right ? [new TextRun({ text: `\t${row.right}`, size: pt(spec.metaSize), font, color: "444444" })] : []),
            ],
          }),
        );
      });
      for (const b of it.bullets) {
        if (!b.text.trim()) continue;
        children.push(
          new Paragraph({
            numbering: { reference: "bullets", level: 0 },
            spacing: { before: twip(spec.bulletGap), line },
            children: runs(parseInline(b.text), spec, spec.fontSize),
          }),
        );
      }
    }
  }

  const doc = new Document({
    creator: r.contact.name || "Resume",
    title: `${r.contact.name} Resume`,
    // A plain bullet list Word recognises as a real list (better for ATS than typed "•" characters).
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
        },
      ],
    },
    styles: { default: { document: { run: { font, size: pt(spec.fontSize) } } } },
    sections: [
      {
        properties: { page: { size: { width: A4_WIDTH, height: A4_HEIGHT }, margin: { top: twip(spec.marginY), bottom: twip(spec.marginY), left: twip(spec.marginX), right: twip(spec.marginX) } } },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
