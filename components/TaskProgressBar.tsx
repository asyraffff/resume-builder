"use client";

import { useEffect, useMemo, useState } from "react";
import { STEPS, expected, formatDuration, label, percent, remaining, remainingText, type Progress, type Task } from "@/lib/stream-progress";
import { loadStats } from "./stream-client";

/** Live progress for a running AI task: bar, current step, elapsed time and an estimate of time left. */
export function TaskProgressBar({ task, progress, className = "" }: { task: Task; progress: Progress; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  const exp = useMemo(() => expected(task, loadStats(task)), [task]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const pct = percent(progress, now, exp);
  const left = remainingText(remaining(progress, now, exp));
  const stepIndex = { sending: 0, analyzing: 1, writing: 2 }[progress.phase];

  return (
    <div className={`w-full ${className}`} role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-foreground">{label(task, progress)}</span>
        <span className="shrink-0 tabular-nums text-muted">{Math.round(pct)}%</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-background"
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className="relative h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }}>
          <span className="absolute inset-0 animate-pulse rounded-full bg-white/25" />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <ol className="flex items-center gap-1.5" aria-label="Steps">
          {STEPS[task].map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden className="text-border">—</span>}
              <span className={i < stepIndex ? "text-good" : i === stepIndex ? "font-medium text-accent" : ""}>
                {i < stepIndex ? "✓ " : ""}
                {s}
              </span>
            </li>
          ))}
        </ol>
        <span className="tabular-nums">
          {formatDuration(now - progress.startedAt)} elapsed{left ? ` · ${left}` : ""}
        </span>
      </div>
    </div>
  );
}
