"use client";

import { useState } from "react";
import { selectJobs, useResumeStore } from "@/store/resume-store";
import type { MatchReport } from "@/lib/schemas";
import type { Progress } from "@/lib/stream-progress";
import { LimitReachedError, runStream } from "./stream-client";

/** Runs a match for any job (not just the one on screen) and tracks live progress and errors per job. */
export function useMatchRunner() {
  const [progress, setProgress] = useState<Record<string, Progress | undefined>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const setReportFor = useResumeStore((s) => s.setReportFor);

  async function run(jobId: string) {
    const job = selectJobs(useResumeStore.getState()).find((j) => j.id === jobId);
    if (!job) return false;
    const update = (p: Progress | undefined) => setProgress((x) => ({ ...x, [jobId]: p }));
    setErrors((e) => ({ ...e, [jobId]: "" }));
    try {
      const report = await runStream<MatchReport>(
        "match",
        "/api/match",
        { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume: job.resume, jd: job.jd, recheck: !!job.report }) },
        update,
      );
      setReportFor(jobId, report);
      return true;
    } catch (e) {
      // A reached limit is shown by the usage meter's "try again at…" card, not as an error.
      const message = e instanceof LimitReachedError ? "" : e instanceof Error ? e.message : "Matching failed.";
      setErrors((x) => ({ ...x, [jobId]: message }));
      return false;
    } finally {
      update(undefined);
    }
  }

  return {
    run,
    progress,
    running: Object.fromEntries(Object.entries(progress).map(([k, v]) => [k, !!v])) as Record<string, boolean>,
    errors,
  };
}
