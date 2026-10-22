import { Document, Font, Link, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { Resume } from "../schemas";
import { parseInline, type Segment } from "../inline";
import { MIN_FIT_SCALE, resolveLayout, type LayoutSpec } from "../layout";
import { BASE_FONTS, SCRIPT_FONTS, scriptFallbacks } from "./fonts";
import { contactParts, countPdfPages, exportText, isInlineList, itemMeta, itemTitleSegments, skillSegments, visibleSections } from "./shared";

/** Where font files are loaded from: the app's /fonts folder in the browser; tests pass a file-path resolver. */
export type FontUrl = (file: string) => string;
const browserFontUrl: FontUrl = (file) => `${typeof window !== "undefined" ? window.location.origin : ""}/fonts/${file}`;

const registered = new Set<string>();
function registerFonts(fontUrl: FontUrl) {
  // Never split words with hyphens: hyphenated fragments can confuse ATS parsers.
  Font.registerHyphenationCallback((word) => [word]);
  const families = [...Object.values(BASE_FONTS), ...SCRIPT_FONTS];
  for (const { family, files } of families) {
    const key = `${family}:${fontUrl(files.regular)}`;
    if (registered.has(key)) continue;
    registered.add(key);
    // Script fonts have no italic: reuse the upright files so italic text in those scripts still renders.
    Font.register({
      family,
      fonts: [
        { src: fontUrl(files.regular), fontWeight: 400, fontStyle: "normal" },
        { src: fontUrl(files.bold), fontWeight: 700, fontStyle: "normal" },
        { src: fontUrl(files.italic ?? files.regular), fontWeight: 400, fontStyle: "italic" },
        { src: fontUrl(files.boldItalic ?? files.bold), fontWeight: 700, fontStyle: "italic" },
      ],
    });
  }
}

function styles(spec: LayoutSpec, families: string[]) {
  return StyleSheet.create({
    page: {
      paddingVertical: spec.marginY,
      paddingHorizontal: spec.marginX,
      fontSize: spec.fontSize,
      fontFamily: families,
      lineHeight: spec.lineHeight,
      color: "#111111",
    },
    name: { fontSize: spec.nameSize, fontWeight: 700, textAlign: spec.nameAlign, color: spec.template === "modern" ? spec.accent : "#111111" },
    contact: { fontSize: spec.metaSize, textAlign: spec.nameAlign, marginTop: 3, color: "#333333" },
    link: { color: "#1a4fbf", textDecoration: "none" },
    heading: {
      fontSize: spec.headingSize,
      fontWeight: 700,
      color: spec.accent,
      letterSpacing: spec.template === "modern" ? 0.8 : 0.3,
      marginTop: spec.sectionGap,
      marginBottom: 3,
      paddingBottom: spec.headingRule ? 1.5 : 0,
      borderBottomWidth: spec.headingRule ? 0.75 : 0,
      borderBottomColor: "#9a9a9a",
    },
    itemRow: { flexDirection: "row", alignItems: "flex-start", marginTop: spec.itemGap },
    // The title takes whatever width the dates leave (basis 0), so long titles wrap instead of running under the
    // dates or pushing them past the margin. The dates keep their natural width, up to 45% of the line.
    itemTitle: { fontWeight: 700, flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 10 },
    itemMeta: { fontSize: spec.metaSize, color: "#444444", flexShrink: 0, maxWidth: "45%", textAlign: "right", marginTop: 0.5 },
    bulletRow: { flexDirection: "row", marginTop: spec.bulletGap, paddingLeft: 6 },
    bulletDot: { width: 10 },
    bulletText: { flex: 1 },
    para: { marginTop: 1 },
  });
}

type S = ReturnType<typeof styles>;

function Rich({ segments, s }: { segments: Segment[]; s: S }) {
  return (
    <>
      {segments.map((seg, i) => {
        const style = { fontWeight: seg.bold ? 700 : undefined, fontStyle: seg.italic ? ("italic" as const) : undefined };
        return seg.href ? (
          <Link key={i} src={seg.href} style={[s.link, style]}>
            {seg.text}
          </Link>
        ) : (
          <Text key={i} style={style}>
            {seg.text}
          </Text>
        );
      })}
    </>
  );
}

function ResumePdf({ r, spec, families }: { r: Resume; spec: LayoutSpec; families: string[] }) {
  const s = styles(spec, families);
  const contact = contactParts(r);
  return (
    <Document title={`${r.contact.name} Resume`} author={r.contact.name} creator="Resume Tailor" producer="Resume Tailor">
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{r.contact.name}</Text>
        {contact.length > 0 && (
          <Text style={s.contact}>
            {contact.map((p, i) => (
              <Text key={i}>
                {i > 0 ? "  |  " : ""}
                {p.href ? (
                  <Link src={p.href} style={s.link}>
                    {p.text}
                  </Link>
                ) : (
                  p.text
                )}
              </Text>
            ))}
          </Text>
        )}

        {r.summary.trim() ? (
          <View>
            <Text style={s.heading} minPresenceAhead={30}>
              SUMMARY
            </Text>
            <Text style={s.para}>
              <Rich segments={parseInline(r.summary)} s={s} />
            </Text>
          </View>
        ) : null}

        {visibleSections(r).map((sec) => (
          <View key={sec.id} break={spec.pageBreakBefore.has(sec.id)}>
            {/* Keep a heading with at least a couple of lines of its section. */}
            <Text style={s.heading} minPresenceAhead={30}>
              {sec.title.toUpperCase()}
            </Text>
            {sec.items.map((it) =>
              isInlineList(sec) ? (
                <Text key={it.id} style={s.para}>
                  <Rich segments={skillSegments(it)} s={s} />
                </Text>
              ) : (
                <View key={it.id}>
                  {itemTitleSegments(it).length || itemMeta(it) ? (
                    <View style={s.itemRow} minPresenceAhead={24}>
                      <Text style={s.itemTitle}>
                        <Rich segments={itemTitleSegments(it)} s={s} />
                      </Text>
                      <Text style={s.itemMeta}>{itemMeta(it)}</Text>
                    </View>
                  ) : null}
                  {it.bullets
                    .filter((b) => b.text.trim())
                    .map((b) => (
                      <View key={b.id} style={s.bulletRow} wrap={false}>
                        <Text style={s.bulletDot}>•</Text>
                        <Text style={s.bulletText}>
                          <Rich segments={parseInline(b.text)} s={s} />
                        </Text>
                      </View>
                    ))}
                </View>
              ),
            )}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export type PdfResult = { blob: Blob; pages: number; scale: number; fitted: boolean };

/**
 * Renders the resume as a PDF. With "fit to one page" on, text and spacing shrink step by step (never below
 * MIN_FIT_SCALE) until it fits; `fitted` says whether one page was reached.
 */
export async function renderPdf(r: Resume, opts: { fontUrl?: FontUrl } = {}): Promise<PdfResult> {
  registerFonts(opts.fontUrl ?? browserFontUrl);
  const families = [BASE_FONTS[r.layout?.font ?? "sans"].family, ...scriptFallbacks(exportText(r))];
  const scales = r.layout?.fitToOnePage ? [1, 0.95, 0.9, 0.86, 0.82, MIN_FIT_SCALE] : [1];
  let last: PdfResult | null = null;
  for (const scale of scales) {
    const blob = await pdf(<ResumePdf r={r} spec={resolveLayout(r.layout, scale)} families={families} />).toBlob();
    const pages = await countPdfPages(blob);
    last = { blob, pages, scale, fitted: pages <= 1 };
    if (pages <= 1) break;
  }
  return last!;
}

export async function buildPdf(r: Resume, opts: { fontUrl?: FontUrl } = {}): Promise<Blob> {
  return (await renderPdf(r, opts)).blob;
}
