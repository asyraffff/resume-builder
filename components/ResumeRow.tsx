"use client";

import { Badge, Button } from "./ui";
import type { Workspace } from "@/store/resume-store";
import { liveScore } from "@/lib/keywords";

/** One saved resume on the Upload page, with Continue and Delete. */
export function ResumeRow({
  w,
  active,
  disabled,
  onContinue,
  onDelete,
}: {
  w: Workspace;
  active: boolean;
  disabled: boolean;
  onContinue: () => void;
  onDelete: () => void;
}) {
  const scored = w.jobs.filter((j) => j.report);
  const best = scored.length ? Math.max(...scored.map((j) => liveScore(j.report!, j.resume, j.jd).score)) : null;
  const details = [
    w.original.contact.name,
    w.ats ? `ATS ${Math.round(w.ats.score)}` : "",
    w.jobs.length ? `${w.jobs.length} job${w.jobs.length > 1 ? "s" : ""}${best !== null ? ` · best match ${Math.round(best)}` : ""}` : "No jobs yet",
    `edited ${timeAgo(w.updatedAt)}`,
  ].filter(Boolean);

  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-xl border bg-surface p-4 ${active ? "border-accent/40 ring-1 ring-accent/20" : "border-border"}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate font-medium">{w.fileName || w.original.contact.name || "Untitled resume"}</span>
          {active && <Badge tone="accent">Open</Badge>}
        </p>
        <p className="truncate text-xs text-muted">{details.join(" · ")}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onContinue} disabled={disabled}>
          Continue
        </Button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          aria-label={`Delete ${w.fileName || "resume"}`}
          title="Delete this resume"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-red-50 hover:text-bad disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.75 7v4M9.25 7v4" />
          </svg>
        </button>
      </div>
    </li>
  );
}

function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
