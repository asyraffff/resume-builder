import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { Resume } from "../schemas";
import { contactLine, isInlineList, itemMeta, itemTitle, skillLine, visibleSections } from "./shared";

// Built-in Helvetica keeps text selectable and avoids font downloads.
const s = StyleSheet.create({
  page: { paddingVertical: 36, paddingHorizontal: 44, fontSize: 10, fontFamily: "Helvetica", lineHeight: 1.35, color: "#111" },
  name: { fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "center" },
  contact: { fontSize: 9.5, textAlign: "center", marginTop: 3, marginBottom: 6 },
  heading: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 0.75,
    borderBottomColor: "#999",
  },
  itemRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  itemTitle: { fontFamily: "Helvetica-Bold", flexShrink: 1, paddingRight: 8 },
  itemMeta: { fontSize: 9.5 },
  bulletRow: { flexDirection: "row", marginTop: 1.5, paddingLeft: 6 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
  skill: { marginTop: 1.5 },
});

function ResumePdf({ r }: { r: Resume }) {
  return (
    <Document title={`${r.contact.name} Resume`} author={r.contact.name}>
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{r.contact.name}</Text>
        <Text style={s.contact}>{contactLine(r)}</Text>

        {r.summary.trim() ? (
          <View>
            <Text style={s.heading}>SUMMARY</Text>
            <Text>{r.summary}</Text>
          </View>
        ) : null}

        {visibleSections(r).map((sec) => (
          <View key={sec.id}>
            <Text style={s.heading}>{sec.title.toUpperCase()}</Text>
            {sec.items.map((it) =>
              isInlineList(sec) ? (
                <Text key={it.id} style={s.skill}>
                  {skillLine(it)}
                </Text>
              ) : (
                <View key={it.id} wrap={false}>
                  {itemTitle(it) || itemMeta(it) ? (
                    <View style={s.itemRow}>
                      <Text style={s.itemTitle}>{itemTitle(it)}</Text>
                      <Text style={s.itemMeta}>{itemMeta(it)}</Text>
                    </View>
                  ) : null}
                  {it.bullets
                    .filter((b) => b.text.trim())
                    .map((b) => (
                      <View key={b.id} style={s.bulletRow}>
                        <Text style={s.bulletDot}>•</Text>
                        <Text style={s.bulletText}>{b.text}</Text>
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

export async function buildPdf(r: Resume): Promise<Blob> {
  return pdf(<ResumePdf r={r} />).toBlob();
}
