"use client";

import { useState } from "react";
import { Button, ErrorNote, Spinner, postForm } from "./ui";
import type { JobDescription } from "@/lib/schemas";
import { ScreenshotInput, imagesFrom } from "./ScreenshotInput";

type Mode = "text" | "url" | "image";
type JdResponse = { jd?: JobDescription; warnings?: string[]; fallback?: boolean; reason?: string };

export function JdInput({
  onParsed,
  disabled,
  submitLabel = "Analyze job",
}: {
  onParsed: (jd: JobDescription, warnings: string[]) => void | Promise<void>;
  disabled?: boolean;
  submitLabel?: string;
}) {
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackMsg, setFallbackMsg] = useState<string | null>(null);

  const canSubmit =
    !busy && !disabled && ((mode === "text" && text.trim().length >= 100) || (mode === "url" && url.trim()) || (mode === "image" && images.length));

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("mode", mode);
      if (mode === "text") fd.append("text", text);
      if (mode === "url") fd.append("url", url);
      if (mode === "image") images.forEach((f) => fd.append("image", f));
      const data = await postForm<JdResponse>("/api/parse-jd", fd);
      if (data.fallback) {
        setFallbackMsg(`${data.reason} Paste the job description text or upload a screenshot instead.`);
        setMode("text");
        return;
      }
      if (data.jd) onParsed(data.jd, data.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the job description.");
    } finally {
      setBusy(false);
    }
  }


  const tabs: [Mode, string][] = [
    ["text", "Paste text"],
    ["url", "Job link"],
    ["image", "Screenshot"],
  ];

  return (
    <div>
      <div className="flex gap-1 rounded-lg bg-background p-1" role="tablist">
        {tabs.map(([m, label]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === m ? "bg-surface shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {fallbackMsg && mode !== "url" && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-warn">{fallbackMsg}</p>
      )}

      <div className="mt-3">
        {mode === "text" && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const files = imagesFrom(e.clipboardData);
              if (files.length && !e.clipboardData.getData("text/plain").trim()) {
                e.preventDefault();
                setImages((prev) => [...prev, ...files].slice(0, 5));
                setMode("image");
              }
            }}
            placeholder="Paste the full job description here: title, responsibilities, requirements… (pasting a screenshot works too)"
            className="h-64 w-full resize-y rounded-lg border border-border bg-surface p-3 text-sm outline-none focus:border-accent"
          />
        )}

        {mode === "url" && (
          <div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.linkedin.com/jobs/view/…"
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
            />
            <p className="mt-2 text-xs text-muted">
              Works with public job pages. LinkedIn and some job sites require signing in. If the link can&apos;t be read,
              you&apos;ll be asked to paste the text or upload a screenshot.
            </p>
          </div>
        )}

        {mode === "image" && <ScreenshotInput images={images} onChange={setImages} />}
      </div>

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      <Button className="mt-4 w-full" onClick={submit} disabled={!canSubmit}>
        {busy ? <><Spinner /> Reading job description…</> : submitLabel}
      </Button>
      {mode === "text" && text.trim().length > 0 && text.trim().length < 100 && (
        <p className="mt-2 text-xs text-muted">Paste a bit more: at least a few sentences.</p>
      )}
    </div>
  );
}
