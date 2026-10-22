"use client";

import { useSyncExternalStore } from "react";
import { activeRichField, applyFormat, type FormatKind } from "./format";

const subscribe = (onChange: () => void) => {
  document.addEventListener("focusin", onChange);
  document.addEventListener("focusout", onChange);
  return () => {
    document.removeEventListener("focusin", onChange);
    document.removeEventListener("focusout", onChange);
  };
};

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent);

/** Bold / italic / link buttons for the focused bullet or summary. */
export function FormatToolbar() {
  const active = useSyncExternalStore(subscribe, () => !!activeRichField(), () => false);
  const mod = useSyncExternalStore(() => () => {}, () => (isMac() ? "⌘" : "Ctrl+"), () => "Ctrl+");

  const buttons: { kind: FormatKind; label: React.ReactNode; title: string }[] = [
    { kind: "bold", label: <span className="font-bold">B</span>, title: `Bold (${mod}B)` },
    { kind: "italic", label: <span className="font-serif italic">I</span>, title: `Italic (${mod}I)` },
    {
      kind: "link",
      label: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1" />
        </svg>
      ),
      title: `Link (${mod}K)`,
    },
  ];

  return (
    <div className="flex items-center gap-1 rounded-lg bg-surface p-1 ring-1 ring-border" role="toolbar" aria-label="Text formatting">
      {buttons.map((b) => (
        <button
          key={b.kind}
          type="button"
          title={b.title}
          aria-label={b.title}
          disabled={!active}
          // Keep focus (and the selection) in the text field.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat(b.kind)}
          className="flex h-7 w-7 items-center justify-center rounded text-sm text-foreground hover:bg-background disabled:cursor-not-allowed disabled:text-muted/50"
        >
          {b.label}
        </button>
      ))}
      <span className="px-1.5 text-xs text-muted">{active ? "Select words, then format" : "Click into a bullet to format"}</span>
    </div>
  );
}
