"use client";

import { safeHref } from "@/lib/inline";

export type FormatKind = "bold" | "italic" | "link";

const MARK = { bold: "**", italic: "*" } as const;

/** The rich-text field that currently has focus, if any. */
export function activeRichField(): HTMLElement | null {
  const el = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
  return el?.dataset.rich === "1" ? el : null;
}

/** Turns what the user typed into a safe link target, adding https:// to bare domains. */
export function normaliseLink(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  return safeHref(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
}

/**
 * Applies bold, italic or a link to the selection in the focused rich-text field by inserting markdown markers.
 * Uses insertText so the change goes through the field's normal input handling (and the browser's own undo).
 * Returns false when no rich-text field is focused.
 */
export function applyFormat(kind: FormatKind): boolean {
  const el = activeRichField();
  const sel = window.getSelection();
  if (!el || !sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return false;

  const selected = sel.toString();
  // Keep surrounding spaces outside the markers, so "word " becomes "**word** " (valid markdown).
  const lead = selected.match(/^\s*/)?.[0] ?? "";
  const trail = selected.match(/\s*$/)?.[0] ?? "";
  const core = selected.trim();

  if (kind === "link") {
    const url = window.prompt("Link address", "https://");
    const href = url ? normaliseLink(url) : null;
    if (!href) return true;
    insert(`${lead}[${core || url!.trim()}](${href})${trail}`);
    return true;
  }

  const m = MARK[kind];
  if (!core) {
    // Nothing selected: insert empty markers and put the cursor between them.
    insert(m + m);
    const s = window.getSelection();
    if (s?.rangeCount) {
      const r = s.getRangeAt(0);
      r.setStart(r.startContainer, Math.max(0, r.startOffset - m.length));
      r.collapse(true);
    }
    return true;
  }
  const wrapped = core.startsWith(m) && core.endsWith(m) && core.length > m.length * 2;
  insert(lead + (wrapped ? core.slice(m.length, -m.length) : m + core + m) + trail);
  return true;
}

function insert(text: string) {
  document.execCommand("insertText", false, text);
}
