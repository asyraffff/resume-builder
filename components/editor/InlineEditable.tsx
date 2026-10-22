"use client";

import { useEffect, useRef } from "react";
import { inlineToHtml, rawOffset } from "@/lib/inline";
import { applyFormat } from "./format";

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** Called with the final text when the field loses focus (e.g. to tidy a link). Defaults to onChange. */
  onCommit?: (v: string) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  /** Show **bold**, *italic* and [links](url) formatted while not editing; markers appear while editing. */
  rich?: boolean;
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  autoFocus?: boolean;
  as?: "span" | "div" | "p";
};

/** Text offset of the caret from the start of the element (counting displayed characters). */
function caretOffset(el: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return null;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(el);
  range.setEnd(sel.anchorNode!, sel.anchorOffset);
  return range.toString().length;
}

function placeCaret(el: HTMLElement, offset: number) {
  const node = el.firstChild;
  const range = document.createRange();
  if (node && node.nodeType === Node.TEXT_NODE) range.setStart(node, Math.min(offset, node.textContent?.length ?? 0));
  else range.selectNodeContents(el);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/**
 * contentEditable that doesn't fight the caret: the DOM is only overwritten when the field isn't focused.
 * Rich fields render formatting when idle and switch to the raw text (with markers) while being edited.
 */
export function InlineEditable({
  value,
  onChange,
  onCommit,
  placeholder,
  className = "",
  multiline,
  rich,
  onEnter,
  onBackspaceEmpty,
  autoFocus,
  as = "span",
}: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (rich) {
      const html = inlineToHtml(value);
      if (el.innerHTML !== html) el.innerHTML = html;
    } else if (el.textContent !== value) el.textContent = value;
  }, [value, rich]);

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [autoFocus]);

  const Tag = as;
  return (
    <Tag
      ref={ref as never}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={placeholder}
      aria-multiline={multiline}
      data-placeholder={placeholder}
      data-rich={rich ? "1" : undefined}
      className={`editable ${className}`}
      onFocus={(e) => {
        if (!rich) return;
        const el = e.currentTarget;
        if (!el.querySelector("strong, em, a")) return; // nothing formatted: raw and displayed text are the same
        // Swap the formatted view for the raw text, keeping the caret where the user clicked. The browser places
        // the click's caret just after focus, so read it on the next task (not rAF, which pauses in hidden tabs).
        setTimeout(() => {
          if (document.activeElement !== el || !el.querySelector("strong, em, a")) return;
          const at = caretOffset(el);
          el.textContent = value;
          placeCaret(el, at === null ? value.length : rawOffset(value, at));
        }, 0);
      }}
      onInput={(e) => onChange((e.currentTarget.textContent ?? "").replace(/ /g, " "))}
      onBlur={(e) => {
        const el = e.currentTarget;
        const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (onCommit) onCommit(t);
        else if (t !== value) onChange(t);
        if (rich) el.innerHTML = inlineToHtml(t);
        else el.textContent = t;
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\s*\n\s*/g, " ");
        document.execCommand("insertText", false, text);
      }}
      onKeyDown={(e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (rich && mod && ["b", "i", "k"].includes(e.key.toLowerCase())) {
          e.preventDefault();
          applyFormat(({ b: "bold", i: "italic", k: "link" } as const)[e.key.toLowerCase() as "b" | "i" | "k"]);
        } else if (e.key === "Enter" && !(multiline && e.shiftKey)) {
          e.preventDefault();
          if (onEnter) onEnter();
          else (e.currentTarget as HTMLElement).blur();
        } else if (e.key === "Backspace" && onBackspaceEmpty && !(e.currentTarget.textContent ?? "").length) {
          e.preventDefault();
          onBackspaceEmpty();
        } else if (e.key === "Escape") {
          (e.currentTarget as HTMLElement).blur();
        }
      }}
    />
  );
}
