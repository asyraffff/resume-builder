/** Shared progress model for long AI tasks that stream their output (resume upload and job matching). */

export type Task = "parse" | "jd" | "match";

/** Events streamed by long-running API routes, one JSON object per line. */
export type StreamEvent<D> =
  | { type: "phase"; phase: "sending" | "analyzing" }
  | { type: "progress"; chars: number; count: number; stage: string }
  | { type: "done"; data: D }
  | { type: "error"; message: string };

export type Progress = {
  startedAt: number;
  phase: "sending" | "analyzing" | "writing";
  phaseStartedAt: number;
  /** Characters of output written so far. */
  chars: number;
  /** Task-specific count of finished pieces (entries extracted, suggestions written). */
  count: number;
  /** Task-specific part of the output being written. */
  stage: string;
};

export type Stats = { durations: number[]; chars: number[] };

/** Starting estimates until this browser has its own history. Measured on typical runs. */
export const DEFAULTS: Record<Task, { duration: number; chars: number }> = {
  parse: { duration: 35_000, chars: 9_000 },
  jd: { duration: 12_000, chars: 2_500 },
  match: { duration: 90_000, chars: 16_000 },
};

export const STEPS: Record<Task, [string, string, string]> = {
  parse: ["Upload", "Read", "Extract & check"],
  jd: ["Send", "Read", "Extract"],
  match: ["Send", "Analyze", "Write"],
};

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Typical duration and output size, learned from this browser's recent runs of the task. */
export function expected(task: Task, stats: Stats) {
  return {
    duration: median(stats.durations) ?? DEFAULTS[task].duration,
    chars: median(stats.chars) ?? DEFAULTS[task].chars,
  };
}

export function startProgress(now: number): Progress {
  return { startedAt: now, phase: "sending", phaseStartedAt: now, chars: 0, count: 0, stage: "" };
}

const PHASE_ORDER = { sending: 0, analyzing: 1, writing: 2 } as const;

/** Phases only move forward and the written size only grows, so percent() never goes backwards. */
export function applyEvent<D>(p: Progress, e: StreamEvent<D>, now: number): Progress {
  if (e.type === "phase" && PHASE_ORDER[e.phase] > PHASE_ORDER[p.phase]) return { ...p, phase: e.phase, phaseStartedAt: now };
  if (e.type === "progress") {
    return {
      ...p,
      phase: "writing",
      phaseStartedAt: p.phase === "writing" ? p.phaseStartedAt : now,
      chars: Math.max(p.chars, e.chars),
      count: Math.max(p.count, e.count),
      stage: e.stage,
    };
  }
  return p;
}

/**
 * Percent complete. While Claude is reasoning there is nothing to measure, so that phase eases toward 45%
 * over time without reaching it. Once it starts writing, progress follows the actual output size.
 * Never reports 100% before the result arrives. With applyEvent's guarantees the value never decreases over time.
 */
export function percent(p: Progress, now: number, exp: { duration: number; chars: number }): number {
  let value: number;
  // The caller's clock ticks every 500ms, so it can lag just behind a phase change.
  const inPhase = Math.max(0, now - p.phaseStartedAt);
  if (p.phase === "sending") {
    value = Math.min(5, 2 + inPhase / 1000);
  } else if (p.phase === "analyzing") {
    // Reasoning typically takes about 40% of the whole run.
    const tau = Math.max(5_000, exp.duration * 0.4) / 2;
    value = 5 + 40 * (1 - Math.exp(-inPhase / tau));
  } else {
    value = 45 + 52 * Math.min(1, p.chars / exp.chars);
  }
  return Math.min(97, value);
}

/** Milliseconds left, or null when the estimate isn't meaningful yet. */
export function remaining(p: Progress, now: number, exp: { duration: number; chars: number }): number | null {
  const elapsed = now - p.startedAt;
  if (p.phase === "writing" && p.chars > 1500) {
    const rate = p.chars / Math.max(1, now - p.phaseStartedAt); // chars per ms
    return Math.max(0, (exp.chars - p.chars) / rate);
  }
  return Math.max(0, exp.duration - elapsed);
}

export function label(task: Task, p: Progress): string {
  if (task === "parse") {
    if (p.phase === "sending") return "Uploading your resume…";
    if (p.phase === "analyzing") return "Reading your resume…";
    if (p.stage === "ats") return "Running the ATS check…";
    return p.count > 0 ? `Extracting sections: ${p.count} ${p.count === 1 ? "entry" : "entries"} found…` : "Extracting sections…";
  }
  if (task === "jd") {
    if (p.phase === "sending") return "Sending the job description…";
    if (p.phase === "analyzing") return "Reading the job description…";
    return p.stage === "keywords" ? "Picking out ATS keywords…" : "Extracting the role and requirements…";
  }
  if (p.phase === "sending") return "Sending your resume and the job description…";
  if (p.phase === "analyzing") return "Analyzing your experience against the job…";
  if (p.stage !== "suggestions") return "Scoring your fit and checking keywords…";
  return p.count > 0 ? `Writing suggestions: ${p.count} done…` : "Writing suggestions…";
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function remainingText(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 5_000) return "Almost done";
  if (ms < 60_000) return `About ${Math.max(5, Math.round(ms / 5000) * 5)}s left`;
  const min = Math.round(ms / 60_000);
  return `About ${min} min left`;
}
