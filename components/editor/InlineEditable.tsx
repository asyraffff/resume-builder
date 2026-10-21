"use client";

import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  autoFocus?: boolean;
  as?: "span" | "div" | "p";
};

/** Plain-text contentEditable that doesn't fight the caret: DOM is only overwritten when not focused. */
export function InlineEditable({ value, onChange, placeholder, className = "", multiline, onEnter, onBackspaceEmpty, autoFocus, as = "span" }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) el.textContent = value;
  }, [value]);

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
      className={`editable ${className}`}
      onInput={(e) => onChange((e.currentTarget.textContent ?? "").replace(/ /g, " "))}
      onBlur={(e) => {
        const t = (e.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim();
        if (t !== value) onChange(t);
        e.currentTarget.textContent = t;
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\s*\n\s*/g, " ");
        document.execCommand("insertText", false, text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(multiline && e.shiftKey)) {
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
