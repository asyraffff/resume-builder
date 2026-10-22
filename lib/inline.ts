import type { Resume } from "./schemas";

/**
 * Lightweight inline formatting stored inside resume text: **bold**, *italic* and [text](https://link).
 * Text stays a plain string everywhere (AI calls, ATS checks, keyword matching use plainText()), and the editor
 * and exporters render the formatting.
 */

export type Segment = { text: string; bold?: boolean; italic?: boolean; href?: string };

// Order matters: bold (**) before italic (*), links first so their text isn't parsed as emphasis.
const TOKEN = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|\*([^*\s][^*\n]*?)\*/g;

/** Only web and email links are allowed; anything else is shown as plain text. */
export function safeHref(url: string): string | null {
  const u = url.trim();
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(u)) return u;
  if (/^https?:\/\/[^\s]+$/i.test(u)) return u;
  return null;
}

export function parseInline(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i) });
    if (m[1] !== undefined) {
      const href = safeHref(m[2]);
      out.push(href ? { text: m[1], href } : { text: m[0] });
    } else if (m[3] !== undefined) out.push({ text: m[3], bold: true });
    else out.push({ text: m[4], italic: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.filter((s) => s.text);
}

/** The text without formatting markers (links keep their visible text). */
export function plainText(text: string): string {
  return parseInline(text)
    .map((s) => s.text)
    .join("");
}

export const hasFormatting = (text: string) => parseInline(text).some((s) => s.bold || s.italic || s.href);

/** Escapes text for safe use in HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Formatting rendered as HTML for display (escaped; links open in a new tab). */
export function inlineToHtml(text: string): string {
  return parseInline(text)
    .map((s) => {
      let h = escapeHtml(s.text);
      if (s.bold) h = `<strong>${h}</strong>`;
      if (s.italic) h = `<em>${h}</em>`;
      if (s.href) h = `<a href="${escapeHtml(s.href)}" target="_blank" rel="noopener noreferrer">${h}</a>`;
      return h;
    })
    .join("");
}

// ---------- Contact links ----------

/**
 * How a profile link should read on a resume: no protocol, no "www.", no trailing slash, and for LinkedIn no
 * tracking parameters. "https://www.linkedin.com/in/jane-doe/?trk=abc" -> "linkedin.com/in/jane-doe".
 */
export function tidyUrl(raw: string): string {
  let u = raw.trim();
  if (!u || /\s/.test(u) || /^mailto:/i.test(u) || /^[^\s@]+@[^\s@]+$/.test(u)) return u;
  u = u.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (/^([a-z]{2,3}\.)?linkedin\.com\//i.test(u)) {
    u = u.replace(/^[a-z]{2,3}\.linkedin\.com/i, "linkedin.com").replace(/[?#].*$/, "");
  }
  return u.replace(/\/+$/, "");
}

/** A clickable address for a contact entry: emails become mailto:, bare domains get https://. */
export function contactHref(value: string): string | null {
  const v = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  if (/^mailto:/i.test(v)) return safeHref(v);
  if (/^https?:\/\//i.test(v)) return safeHref(v);
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)) return `https://${v}`;
  return null;
}

/** A copy of the resume with formatting markers removed, for analysis (AI, ATS checks, keywords, comparisons). */
export function plainResume(formatted: Resume): Resume {
  // Layout only affects how the page looks, so it's left out of analysis (and out of what's sent to the AI).
  const r = { contact: formatted.contact, summary: formatted.summary, sections: formatted.sections };
  return {
    ...r,
    summary: plainText(r.summary),
    sections: r.sections.map((s) => ({
      ...s,
      items: s.items.map((it) => ({
        ...it,
        heading: plainText(it.heading),
        subheading: plainText(it.subheading),
        bullets: it.bullets.map((b) => ({ ...b, text: plainText(b.text) })),
      })),
    })),
  };
}

/**
 * Maps a position in the displayed (formatted) text to the same position in the stored text with markers,
 * so clicking into a bullet puts the cursor where the user clicked.
 */
export function rawOffset(text: string, plainOffset: number): number {
  let plain = 0;
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    const before = i - last;
    // At a boundary, prefer inside the formatted text so typing there keeps the formatting.
    if (plainOffset < plain + before) return last + (plainOffset - plain);
    plain += before;
    const isLink = m[1] !== undefined && safeHref(m[2]) !== null;
    const inner = isLink ? m[1] : m[3] ?? m[4] ?? m[0];
    const prefix = isLink ? 1 : m[3] !== undefined ? 2 : m[4] !== undefined ? 1 : 0;
    if (m[1] !== undefined && !isLink) {
      // An unsafe link is shown verbatim, so offsets map one-to-one.
      if (plainOffset <= plain + m[0].length) return i + (plainOffset - plain);
      plain += m[0].length;
    } else {
      if (plainOffset <= plain + inner.length) return i + prefix + (plainOffset - plain);
      plain += inner.length;
    }
    last = i + m[0].length;
  }
  return Math.min(text.length, last + (plainOffset - plain));
}
