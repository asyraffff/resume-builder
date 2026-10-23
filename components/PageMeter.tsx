"use client";

import { useEffect, useMemo, useState } from "react";
import type { Resume } from "@/lib/schemas";
import { countWords } from "@/lib/export/shared";

/**
 * Live word count, plus the page count of the real PDF (measured shortly after typing stops, since rendering the
 * PDF takes a moment).
 */
export function PageMeter({ resume }: { resume: Resume }) {
  const words = useMemo(() => countWords(resume), [resume]);
  const [measured, setMeasured] = useState<{ for: Resume; pages: number; fitted: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { renderPdf } = await import("@/lib/export/pdf");
        const r = await renderPdf(resume);
        if (!cancelled) setMeasured({ for: resume, pages: r.pages, fitted: r.fitted });
      } catch {
        /* the count is a convenience; export reports real errors */
      }
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [resume]);

  const pages = measured?.pages;
  const stale = measured?.for !== resume;
  const tone = pages === undefined ? "text-muted" : pages <= 1 ? "text-good" : pages <= 2 ? "text-foreground" : "text-warn";
  const fit = resume.layout?.fitToOnePage;

  return (
    <div
      className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-xs ring-1 ring-border"
      title="Pages are measured from the exported PDF. Most recruiters expect one page early in a career and two at most."
    >
      <span className={`font-medium tabular-nums ${stale ? "text-muted" : tone}`}>
        {pages === undefined ? "… pages" : `${pages} page${pages > 1 ? "s" : ""}`}
      </span>
      <span className="text-border" aria-hidden>
        |
      </span>
      <span className="tabular-nums text-muted">{words} words</span>
      {fit && measured && !stale && (
        <span className={measured.fitted ? "text-good" : "text-warn"}>{measured.fitted ? "· fit to 1 page" : "· too long to fit"}</span>
      )}
    </div>
  );
}
