"use client";

import { useEffect, useRef, useState } from "react";
import type { Resume } from "@/lib/schemas";
import { Spinner } from "./ui";

type Rendered = { pages: number; scale: number; fitted: boolean; fitRequested: boolean };

/**
 * The exported PDF, page by page, exactly as it will print. Re-renders shortly after each change; the previous pages
 * stay on screen while the new ones are prepared, so editing layout options doesn't flicker.
 */
export function PreviewView({ resume }: { resume: Resume }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(true);
  const [info, setInfo] = useState<Rendered | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const [{ renderPdf }, pdfjs] = await Promise.all([import("@/lib/export/pdf"), import("pdfjs-dist")]);
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const result = await renderPdf(resume);
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await result.blob.arrayBuffer()) }).promise;
        const host = pagesRef.current;
        if (cancelled || !host) return;

        // Draw every page off-screen first, then swap them in together.
        const width = Math.min(host.clientWidth || 800, 820);
        const ratio = window.devicePixelRatio || 1;
        const frames: HTMLElement[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${width}px`;
          canvas.className = "block bg-white shadow-sm ring-1 ring-border";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `Page ${n} of ${doc.numPages}`);
          await page.render({ canvas, viewport }).promise;
          const frame = document.createElement("figure");
          frame.className = "mx-auto";
          frame.style.width = `${width}px`;
          const caption = document.createElement("figcaption");
          caption.className = "mb-1 text-xs text-muted";
          caption.textContent = `Page ${n} of ${doc.numPages}`;
          frame.append(caption, canvas);
          frames.push(frame);
          if (cancelled) return;
        }
        host.replaceChildren(...frames);
        setInfo({ pages: doc.numPages, scale: result.scale, fitted: result.fitted, fitRequested: !!resume.layout?.fitToOnePage });
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't draw the preview.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [resume]);

  return (
    <div>
      <div className="mb-3 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {info && (
          <span className="font-medium">
            {info.pages} page{info.pages > 1 ? "s" : ""}
          </span>
        )}
        {info?.fitRequested && info.fitted && info.scale < 1 && (
          <span className="text-xs text-good">Shrunk to {Math.round(info.scale * 100)}% to fit on one page.</span>
        )}
        {info?.fitRequested && !info.fitted && (
          <span className="text-xs text-warn">
            Doesn&apos;t fit on one page even at the smallest readable size. Hide a section or shorten some bullets.
          </span>
        )}
        {busy && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Spinner /> Updating preview…
          </span>
        )}
      </div>
      {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-bad">{error}</p>}
      <div ref={pagesRef} className="space-y-6" aria-live="polite" aria-busy={busy} />
    </div>
  );
}
