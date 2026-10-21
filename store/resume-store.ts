"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { AtsReport, JobDescription, MatchReport, Resume } from "@/lib/schemas";
import { applySuggestion, reorderSections } from "@/lib/apply-suggestion";
import { newId } from "@/lib/ids";
import { hasPlaceholders } from "@/lib/placeholders";

export type SuggestionStatus = "accepted" | "rejected" | "failed";

/** One job the user is applying for, with its own tailored resume. */
export type Job = {
  id: string;
  label: string;
  jd: JobDescription;
  resume: Resume;
  report: MatchReport | null;
  suggestionStatus: Record<string, SuggestionStatus>;
  createdAt: number;
  updatedAt: number;
};

export type StartFrom = "original" | "current";

/** One uploaded resume with everything built from it: ATS check, jobs and tailored versions. */
export type Workspace = {
  id: string;
  fileName: string;
  original: Resume;
  ats: AtsReport | null;
  resume: Resume;
  jd: JobDescription | null;
  report: MatchReport | null;
  suggestionStatus: Record<string, SuggestionStatus>;
  jobs: Job[];
  activeJobId: string | null;
  createdAt: number;
  updatedAt: number;
};

type State = {
  /** The resume on screen: the active job's tailored resume, or the general draft when no job is active. */
  resume: Resume | null;
  /** The resume as uploaded. */
  original: Resume | null;
  ats: AtsReport | null;
  fileName: string;
  /** Active job's data, kept at the top level so the editor and suggestions don't need to know about jobs. */
  jd: JobDescription | null;
  report: MatchReport | null;
  suggestionStatus: Record<string, SuggestionStatus>;
  /** All jobs. The active job's entry may be stale; use selectJobs() for an up-to-date list. */
  jobs: Job[];
  activeJobId: string | null;
  /** All saved resumes. The active one's entry may be stale; use selectWorkspaces() for an up-to-date list. */
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  /** When the open resume was last changed by the user (edits, jobs, matches). Shown as "edited … ago". */
  editedAt: number;
  past: Resume[];
  future: Resume[];
  lastEditKey: string | null;
};

type Actions = {
  /** Saves a newly uploaded resume as its own workspace and opens it. Other resumes are kept as they are. */
  setParsed: (resume: Resume, ats: AtsReport, fileName: string) => void;
  switchWorkspace: (id: string) => void;
  deleteWorkspace: (id: string) => void;
  /** Adds a job and makes it active. Its resume starts from the uploaded resume or a copy of the one on screen. */
  addJob: (jd: JobDescription, startFrom: StartFrom) => string;
  switchJob: (id: string) => void;
  deleteJob: (id: string) => void;
  renameJob: (id: string, label: string) => void;
  /** Stores a match report for a job, even if the user has switched to another job while it was running. */
  setReportFor: (jobId: string | null, report: MatchReport) => void;
  /** Apply an edit. Consecutive edits with the same coalesceKey (e.g. typing in one field) share one undo step. */
  updateResume: (fn: (r: Resume) => Resume, coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;
  acceptSuggestion: (id: string, override?: string) => boolean;
  rejectSuggestion: (id: string) => void;
  acceptAllSafe: () => number;
  applySuggestedOrder: () => void;
  resetToOriginal: () => void;
  startOver: () => void;
};

const HISTORY_LIMIT = 50;

// localStorage can be unavailable (private mode, blocked storage) — never let that break the app.
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* quota or blocked */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const jobLabel = (jd: JobDescription | null) => [jd?.company, jd?.title].filter(Boolean).join(" – ") || "Untitled job";

const emptyJobState = { jd: null, report: null, suggestionStatus: {}, past: [], future: [], lastEditKey: null };

type StoreState = State & Actions;

/** Writes the on-screen workspace back into the active job's entry. */
function snapshotActive(s: StoreState): Job[] {
  if (!s.activeJobId || !s.resume) return s.jobs;
  return s.jobs.map((j) =>
    j.id === s.activeJobId
      ? { ...j, resume: s.resume!, jd: s.jd ?? j.jd, report: s.report, suggestionStatus: s.suggestionStatus, updatedAt: Date.now() }
      : j,
  );
}

/** The on-screen resume and its jobs as a workspace entry, or null if nothing is open. */
function currentWorkspace(s: StoreState, jobs: Job[]): Workspace | null {
  if (!s.activeWorkspaceId || !s.resume || !s.original) return null;
  const prev = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
  return {
    id: s.activeWorkspaceId,
    fileName: s.fileName,
    original: s.original,
    ats: s.ats,
    resume: s.resume,
    jd: s.jd,
    report: s.report,
    suggestionStatus: s.suggestionStatus,
    jobs,
    activeJobId: s.activeJobId,
    createdAt: prev?.createdAt ?? s.editedAt,
    updatedAt: s.editedAt || prev?.updatedAt || Date.now(),
  };
}

/** Writes the on-screen resume back into its workspace entry. */
function snapshotWorkspaces(s: StoreState): Workspace[] {
  const cur = currentWorkspace(s, snapshotActive(s));
  if (!cur) return s.workspaces;
  const exists = s.workspaces.some((w) => w.id === cur.id);
  return exists ? s.workspaces.map((w) => (w.id === cur.id ? cur : w)) : [...s.workspaces, cur];
}

/** Saved resumes with the open one reflecting what's on screen. */
export function selectWorkspaces(s: StoreState): Workspace[] {
  const cur = currentWorkspace(s, selectJobs(s));
  if (!cur) return s.workspaces;
  return s.workspaces.some((w) => w.id === cur.id) ? s.workspaces.map((w) => (w.id === cur.id ? cur : w)) : [...s.workspaces, cur];
}

const noResume = {
  resume: null,
  original: null,
  ats: null,
  fileName: "",
  jobs: [],
  activeJobId: null,
  activeWorkspaceId: null,
  editedAt: 0,
  jd: null,
  report: null,
  suggestionStatus: {},
  past: [],
  future: [],
  lastEditKey: null,
};

/** Jobs with the active one reflecting what's on screen. */
export function selectJobs(s: StoreState): Job[] {
  if (!s.activeJobId || !s.resume) return s.jobs;
  return s.jobs.map((j) =>
    j.id === s.activeJobId ? { ...j, resume: s.resume!, jd: s.jd ?? j.jd, report: s.report, suggestionStatus: s.suggestionStatus } : j,
  );
}

export const useResumeStore = create<StoreState>()(
  persist(
    (set, get) => {
      const commit = (next: Resume, coalesceKey?: string) => {
        const { resume, past, lastEditKey } = get();
        if (!resume) return;
        const coalesce = coalesceKey != null && coalesceKey === lastEditKey;
        set({
          resume: next,
          past: coalesce ? past : [...past, resume].slice(-HISTORY_LIMIT),
          future: [],
          lastEditKey: coalesceKey ?? null,
          editedAt: Date.now(),
        });
      };

      const loadJob = (job: Job) =>
        set({
          resume: job.resume,
          jd: job.jd,
          report: job.report,
          suggestionStatus: job.suggestionStatus,
          activeJobId: job.id,
          // Undo history belongs to one job; don't let it leak into another.
          past: [],
          future: [],
          lastEditKey: null,
        });

      const loadWorkspace = (w: Workspace) =>
        set({
          resume: w.resume,
          original: w.original,
          ats: w.ats,
          fileName: w.fileName,
          jd: w.jd,
          report: w.report,
          suggestionStatus: w.suggestionStatus,
          jobs: w.jobs,
          activeJobId: w.activeJobId,
          activeWorkspaceId: w.id,
          editedAt: w.updatedAt,
          past: [],
          future: [],
          lastEditKey: null,
        });

      return {
        ...noResume,
        workspaces: [],

        setParsed: (resume, ats, fileName) => {
          const workspaces = snapshotWorkspaces(get());
          const now = Date.now();
          const w: Workspace = {
            id: newId(),
            fileName,
            original: resume,
            ats,
            resume,
            jd: null,
            report: null,
            suggestionStatus: {},
            jobs: [],
            activeJobId: null,
            createdAt: now,
            updatedAt: now,
          };
          set({ workspaces: [...workspaces, w] });
          loadWorkspace(w);
        },

        switchWorkspace: (id) => {
          const s = get();
          if (id === s.activeWorkspaceId) return;
          const workspaces = snapshotWorkspaces(s);
          const w = workspaces.find((x) => x.id === id);
          if (!w) return;
          set({ workspaces });
          loadWorkspace(w);
        },

        deleteWorkspace: (id) => {
          const s = get();
          const workspaces = snapshotWorkspaces(s).filter((w) => w.id !== id);
          set({ workspaces });
          if (s.activeWorkspaceId !== id) return;
          // Deleted the open resume: open the most recently edited remaining one, or nothing.
          const next = [...workspaces].sort((a, b) => b.updatedAt - a.updatedAt)[0];
          if (next) loadWorkspace(next);
          else set({ ...noResume });
        },

        addJob: (jd, startFrom) => {
          const s = get();
          const base = startFrom === "current" ? s.resume : s.original;
          if (!base) return "";
          const now = Date.now();
          const job: Job = { id: newId(), label: jobLabel(jd), jd, resume: base, report: null, suggestionStatus: {}, createdAt: now, updatedAt: now };
          set({ jobs: [...snapshotActive(s), job], editedAt: Date.now() });
          loadJob(job);
          return job.id;
        },

        switchJob: (id) => {
          const s = get();
          if (id === s.activeJobId) return;
          const jobs = snapshotActive(s);
          const job = jobs.find((j) => j.id === id);
          if (!job) return;
          set({ jobs });
          loadJob(job);
        },

        deleteJob: (id) => {
          const s = get();
          const jobs = snapshotActive(s).filter((j) => j.id !== id);
          set({ jobs, editedAt: Date.now() });
          if (s.activeJobId !== id) return;
          // Deleted the job on screen: show the most recently used remaining job, or fall back to the uploaded resume.
          const next = [...jobs].sort((a, b) => b.updatedAt - a.updatedAt)[0];
          if (next) loadJob(next);
          else set({ resume: s.original, activeJobId: null, ...emptyJobState });
        },

        renameJob: (id, label) =>
          set({ jobs: get().jobs.map((j) => (j.id === id ? { ...j, label: label.trim() || jobLabel(j.jd) } : j)), editedAt: Date.now() }),

        setReportFor: (jobId, report) => {
          const s = get();
          if (jobId === s.activeJobId) set({ report, suggestionStatus: {}, editedAt: Date.now() });
          else set({ jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, report, suggestionStatus: {}, updatedAt: Date.now() } : j)), editedAt: Date.now() });
        },

        updateResume: (fn, coalesceKey) => {
          const { resume } = get();
          if (resume) commit(fn(resume), coalesceKey);
        },

        undo: () => {
          const { past, resume, future } = get();
          if (!past.length || !resume) return;
          set({ resume: past[past.length - 1], past: past.slice(0, -1), future: [resume, ...future], lastEditKey: null, editedAt: Date.now() });
        },

        redo: () => {
          const { past, resume, future } = get();
          if (!future.length || !resume) return;
          set({ resume: future[0], future: future.slice(1), past: [...past, resume], lastEditKey: null, editedAt: Date.now() });
        },

        acceptSuggestion: (id, override) => {
          const { resume, report, suggestionStatus } = get();
          const s = report?.suggestions.find((x) => x.id === id);
          if (!resume || !s) return false;
          const next = applySuggestion(resume, s, override);
          if (!next) {
            set({ suggestionStatus: { ...suggestionStatus, [id]: "failed" } });
            return false;
          }
          commit(next);
          set({ suggestionStatus: { ...get().suggestionStatus, [id]: "accepted" } });
          return true;
        },

        rejectSuggestion: (id) => set({ suggestionStatus: { ...get().suggestionStatus, [id]: "rejected" }, editedAt: Date.now() }),

        acceptAllSafe: () => {
          const { resume, report, suggestionStatus } = get();
          if (!resume || !report) return 0;
          let current = resume;
          const status = { ...suggestionStatus };
          let count = 0;
          for (const s of report.suggestions) {
            if (status[s.id] || s.needsUserConfirmation || hasPlaceholders(s.proposed)) continue;
            const next = applySuggestion(current, s);
            if (next) {
              current = next;
              status[s.id] = "accepted";
              count++;
            } else {
              status[s.id] = "failed";
            }
          }
          if (count) commit(current);
          set({ suggestionStatus: status });
          return count;
        },

        applySuggestedOrder: () => {
          const { resume, report } = get();
          if (resume && report?.suggestedSectionOrder.length) commit(reorderSections(resume, report.suggestedSectionOrder));
        },

        resetToOriginal: () => {
          const { original } = get();
          if (original) {
            commit(original);
            set({ suggestionStatus: {} });
          }
        },

        startOver: () => set({ ...noResume, workspaces: [] }),
      };
    },
    {
      name: "resume-tailor",
      version: 3,
      storage: createJSONStorage(() => safeStorage),
      // Undo history stays in memory only. The active job is snapshotted on save so the jobs list is never stale on disk.
      partialize: (s) => ({
        resume: s.resume,
        original: s.original,
        ats: s.ats,
        fileName: s.fileName,
        jd: s.jd,
        report: s.report,
        suggestionStatus: s.suggestionStatus,
        jobs: snapshotActive(s),
        activeJobId: s.activeJobId,
        workspaces: snapshotWorkspaces(s),
        activeWorkspaceId: s.activeWorkspaceId,
        editedAt: s.editedAt,
      }),
      migrate: (persisted, version) => {
        let state = persisted as Partial<State>;
        if (version < 2) state = migrateV1(persisted as V1State);
        if (version < 3) state = migrateV2(state);
        return state as StoreState;
      },
    },
  ),
);

type V1Version = {
  id: string;
  name: string;
  savedAt: number;
  resume: Resume;
  jd: JobDescription | null;
  report?: MatchReport | null;
  suggestionStatus?: Record<string, SuggestionStatus>;
};
type V1State = {
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

/** True once persisted state has loaded. False during SSR and the first client render, which avoids hydration mismatches. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const unsub = useResumeStore.persist.onFinishHydration(() => setHydrated(true));
    if (useResumeStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);
  return hydrated;
}
