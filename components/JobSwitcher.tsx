"use client";

import Link from "next/link";
import { selectJobs, useResumeStore } from "@/store/resume-store";

/** Picks which job's tailored resume is on screen. */
export function JobSwitcher() {
  const state = useResumeStore();
  const { activeJobId, switchJob } = state;
  const jobs = selectJobs(state);

  return (
    <div>
      {state.fileName && (
        <p className="mb-2 flex items-center justify-between gap-2 border-b border-border pb-2 text-xs text-muted">
          <span className="truncate">
            Resume: <span className="font-medium text-foreground">{state.fileName}</span>
          </span>
          <Link href="/" className="shrink-0 font-medium text-accent hover:underline">
            Switch resume
          </Link>
        </p>
      )}
      <div className="flex items-center justify-between">
        <label htmlFor="job-switcher" className="text-xs font-medium text-muted">
          Tailoring for
        </label>
        <Link href="/job" className="text-xs font-medium text-accent hover:underline">
          {jobs.length ? "Manage jobs" : "Add a job"}
        </Link>
      </div>
      {jobs.length > 0 ? (
        <select
          id="job-switcher"
          value={activeJobId ?? ""}
          onChange={(e) => e.target.value && switchJob(e.target.value)}
          className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm font-medium outline-none focus:border-accent"
        >
          {!activeJobId && <option value="">General resume (no job)</option>}
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.label}
              {j.report ? ` · match ${Math.round(j.report.score)}` : ""}
            </option>
          ))}
        </select>
      ) : (
        <p className="mt-1 text-sm font-medium">General resume (no job yet)</p>
      )}
    </div>
  );
}
