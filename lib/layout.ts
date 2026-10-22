import { z } from "zod";

/**
 * How a resume is laid out on the page. Stored on the resume itself (optional), so every tailored version keeps its
 * own look and layout changes are part of undo. All templates are single-column and ATS-safe.
 */
export const Layout = z.object({
  template: z.enum(["classic", "modern", "compact"]).optional(),
  font: z.enum(["sans", "serif"]).optional(),
  size: z.enum(["small", "medium", "large"]).optional(),
  spacing: z.enum(["tight", "normal", "relaxed"]).optional(),
  margins: z.enum(["narrow", "normal", "wide"]).optional(),
  /** Section ids that should start on a new page. */
  pageBreakBefore: z.array(z.string()).optional(),
  /** Shrink text and spacing (within readable limits) until the resume fits on one page. */
  fitToOnePage: z.boolean().optional(),
});
export type Layout = z.infer<typeof Layout>;

export type Template = NonNullable<Layout["template"]>;

export const TEMPLATES: { id: Template; name: string; description: string }[] = [
  { id: "classic", name: "Classic", description: "Centered name, rules under headings" },
  { id: "modern", name: "Modern", description: "Left-aligned, accent-coloured headings" },
  { id: "compact", name: "Compact", description: "Dense, fits more on a page" },
];

export const DEFAULT_LAYOUT: Required<Layout> = {
  template: "classic",
  font: "sans",
  size: "medium",
  spacing: "normal",
  margins: "normal",
  pageBreakBefore: [],
  fitToOnePage: false,
};

/** Concrete measurements (in points) used by both the PDF and Word exporters. */
export type LayoutSpec = {
  template: Template;
  font: "sans" | "serif";
  fontSize: number;
  nameSize: number;
  headingSize: number;
  metaSize: number;
  lineHeight: number;
  sectionGap: number;
  itemGap: number;
  bulletGap: number;
  marginX: number;
  marginY: number;
  accent: string;
  nameAlign: "center" | "left";
  headingRule: boolean;
  pageBreakBefore: Set<string>;
};

/** Smallest scale "fit to one page" will use, so text never becomes hard to read (about 8pt body text). */
export const MIN_FIT_SCALE = 0.78;

export function resolveLayout(layout: Layout | undefined, scale = 1): LayoutSpec {
  const l = { ...DEFAULT_LAYOUT, ...layout };
  const base = { small: 9.5, medium: 10.5, large: 11.5 }[l.size] - (l.template === "compact" ? 0.5 : 0);
  const sp = { tight: 0.75, normal: 1, relaxed: 1.3 }[l.spacing] * (l.template === "compact" ? 0.8 : 1);
  const m = { narrow: { x: 30, y: 26 }, normal: { x: 44, y: 36 }, wide: { x: 60, y: 48 } }[l.margins];
  const s = (n: number) => Math.round(n * scale * 100) / 100;
  return {
    template: l.template,
    font: l.font,
    fontSize: s(base),
    nameSize: s(base + (l.template === "modern" ? 10 : l.template === "compact" ? 6 : 8)),
    headingSize: s(base + (l.template === "compact" ? 0 : 0.5)),
    metaSize: s(base - 0.5),
    lineHeight: { tight: 1.25, normal: 1.35, relaxed: 1.5 }[l.spacing],
    sectionGap: s(11 * sp),
    itemGap: s(6 * sp),
    bulletGap: s(1.5 * sp),
    marginX: s(m.x),
    marginY: s(m.y),
    accent: l.template === "modern" ? "#1e3a8a" : "#111111",
    nameAlign: l.template === "classic" ? "center" : "left",
    headingRule: l.template !== "modern",
    pageBreakBefore: new Set(l.pageBreakBefore),
  };
}
