"use client";

import { useState } from "react";
import { TaskProgressBar } from "./TaskProgressBar";
import { Badge, Button, Card, ErrorNote, ScoreRing, Spinner } from "./ui";
import type { Progress } from "@/lib/stream-progress";
import { jobLabel, type Job } from "@/store/resume-store";
import { liveScore } from "@/lib/keywords";

/** One job on the Job descriptions page: details, match score or live progress, and actions. */
export function JobCard({
  job,
  active,
  highlight,
  progress,
  error,
  onOpen,
  onMatch,
  onRename,
  onDelete,
}: {
  job: Job;
  active: boolean;
  highlight: boolean;
  progress?: Progress;
  error?: string;
  onOpen: () => void;
  onMatch: () => void;
  onRename: (label: string) => void;
  onDelete: () => void;
}) {
  const running = !!progress;
  const [details, setDetails] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(job.label);
  const accepted = Object.values(job.suggestionStatus).filter((v) => v === "accepted").length;
  const meta = [job.jd.company, job.jd.seniority].filter(Boolean).join(" · ");

  return (
    <Card className={highlight ? "ring-2 ring-accent/40" : ""}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onRename(label);
                setRenaming(false);
              }}
            >
              <input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={jobLabel(job.jd)}
                aria-label="Job name"
                className="h-8 min-w-0 flex-1 rounded-lg border border-border px-2 text-sm outline-none focus:border-accent"
              />
              <Button size="sm" type="submit">Save</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => { setLabel(job.label); setRenaming(false); }}>Cancel</Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{job.label}</h3>
              {active && <Badge tone="accent">In editor</Badge>}
              <button className="text-xs text-muted hover:text-foreground" onClick={() => setRenaming(true)}>Rename</button>
            </div>
          )}
          <p className="mt-0.5 text-sm text-muted">{[job.jd.title !== job.label ? job.jd.title : "", meta].filter(Boolean).join(" · ")}</p>
          <p className={`mt-2 text-sm text-muted ${details ? "" : "line-clamp-2"}`}>{job.jd.summary}</p>

          {job.jd.keywords.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(details ? job.jd.keywords : job.jd.keywords.slice(0, 10)).map((k) => <Badge key={k}>{k}</Badge>)}
              {!details && job.jd.keywords.length > 10 && <Badge>+{job.jd.keywords.length - 10}</Badge>}
            </div>
          )}

          {details && (
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <DetailList title="Required" items={job.jd.requiredSkills} />
              <DetailList title="Nice to have" items={job.jd.niceToHaveSkills} />
              <div className="sm:col-span-2">
                <DetailList title="Responsibilities" items={job.jd.responsibilities} />
              </div>
            </div>
          )}
          <button className="mt-2 text-xs font-medium text-accent hover:underline" onClick={() => setDetails(!details)}>
            {details ? "Hide details" : "Show details"}
          </button>
        </div>

        <div className="w-20 shrink-0 text-center">
          {running ? (
            <div className="flex flex-col items-center gap-1 pt-4 text-xs text-muted">
              <Spinner className="text-accent" />
              Matching
            </div>
          ) : job.report ? (
            <ScoreRing score={liveScore(job.report, job.resume, job.jd).score} label="Match" size={64} />
          ) : (
            <p className="pt-3 text-xs text-muted">Not matched yet</p>
          )}
        </div>
      </div>

      {job.warnings && job.warnings.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-warn" role="note">
          <p className="font-medium">This posting contains text aimed at AI tools. It was ignored and kept out of the keywords.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
            {job.warnings.map((w) => (
              <li key={w}>&ldquo;{w}&rdquo;</li>
            ))}
          </ul>
        </div>
      )}

      {progress && (
        <div className="mt-4 rounded-lg bg-accent-soft/50 p-3">
          <TaskProgressBar task="match" progress={progress} />
          <p className="mt-2 text-xs text-muted">You can keep working; the result is saved to this job when it&apos;s ready.</p>
        </div>
      )}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button size="sm" onClick={onOpen}>Tailor resume →</Button>
        <Button size="sm" variant="secondary" onClick={onMatch} disabled={running}>
          {job.report ? "Re-run match" : error ? "Retry match" : "Run match"}
        </Button>
        {job.report && (
          <span className="text-xs text-muted">
            {accepted} of {job.report.suggestions.length} suggestions applied
          </span>
        )}
        <Button size="sm" variant="danger" className="ml-auto" onClick={onDelete}>Delete</Button>
      </div>
    </Card>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
}
