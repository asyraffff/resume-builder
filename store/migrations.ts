import type { AtsReport, JobDescription, MatchReport, Resume } from "@/lib/schemas";
import { newId } from "@/lib/ids";
import { jobLabel, type Job, type State, type SuggestionStatus, type Workspace } from "./types";

type V1Version = {
  id: string;
  name: string;
  savedAt: number;
  resume: Resume;
  jd: JobDescription | null;
  report?: MatchReport | null;
  suggestionStatus?: Record<string, SuggestionStatus>;
};
export type V1State = {
  resume: Resume | null;
  original: Resume | null;
  ats: AtsReport | null;
  fileName: string;
  jd: JobDescription | null;
  report: MatchReport | null;
  suggestionStatus: Record<string, SuggestionStatus>;
  versions?: V1Version[];
  activeVersionId?: string | null;
};

/** v1 had one job on screen plus "saved versions". v2 turns each into a job, without losing or duplicating anything. */
export function migrateV1(old: V1State): Partial<State> {
  const jobs: Job[] = [];
  const now = Date.now();
  let activeJobId: string | null = null;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  if (old.jd && old.resume) {
    activeJobId = newId();
    jobs.push({
      id: activeJobId,
      label: jobLabel(old.jd),
      jd: old.jd,
      resume: old.resume,
      report: old.report,
      suggestionStatus: old.suggestionStatus ?? {},
      createdAt: now,
      updatedAt: now,
    });
  }
  for (const v of old.versions ?? []) {
    if (!v.jd) continue; // a version without a job has nothing to tailor against
    if (same(v.resume, old.resume) && same(v.jd, old.jd)) continue; // identical to the job on screen
    const sameJob = !!old.jd && v.jd.title === old.jd.title && v.jd.company === old.jd.company;
    jobs.push({
      id: newId(),
      label: activeJobId ? `${v.name} (saved ${new Date(v.savedAt).toLocaleDateString()})` : v.name,
      jd: v.jd,
      resume: v.resume,
      // Versions saved before reports were stored can reuse the current report when it's for the same job.
      report: v.report ?? (sameJob ? old.report : null),
      suggestionStatus: v.suggestionStatus ?? (sameJob ? old.suggestionStatus : {}),
      createdAt: v.savedAt,
      updatedAt: v.savedAt,
    });
  }
  return {
    resume: old.resume,
    original: old.original,
    ats: old.ats,
    fileName: old.fileName,
    jd: old.jd,
    report: old.report,
    suggestionStatus: old.suggestionStatus ?? {},
    jobs,
    activeJobId,
  };
}

/** v2 had a single resume. v3 keeps several; the existing one becomes the first saved resume. */
export function migrateV2(old: Partial<State>): Partial<State> {
  if (!old.resume || !old.original) return { ...old, workspaces: [], activeWorkspaceId: null };
  const now = Date.now();
  const w: Workspace = {
    id: newId(),
    fileName: old.fileName ?? "",
    original: old.original,
    ats: old.ats ?? null,
    resume: old.resume,
    jd: old.jd ?? null,
    report: old.report ?? null,
    suggestionStatus: old.suggestionStatus ?? {},
    jobs: old.jobs ?? [],
    activeJobId: old.activeJobId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  return { ...old, workspaces: [w], activeWorkspaceId: w.id, editedAt: now };
}
