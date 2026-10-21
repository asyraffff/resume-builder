"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AtsReport, JobDescription, MatchReport, Resume } from "@/lib/schemas";
import { applySuggestion, isStale, reorderSections } from "@/lib/apply-suggestion";
import { newId } from "@/lib/ids";
import { hasPlaceholders } from "@/lib/placeholders";
import { safeStorage } from "./storage";
import { migrateV1, migrateV2, type V1State } from "./migrations";
import { jobLabel, type Job, type StartFrom, type State, type Workspace } from "./types";

// Re-exported so the rest of the app can keep importing everything store-related from here.
export { useSaveFailed } from "./storage";
export { migrateV1, migrateV2 } from "./migrations";
export { jobLabel } from "./types";
export type { Job, StartFrom, SuggestionStatus, Workspace } from "./types";

type Actions = {
  /** Saves a newly uploaded resume as its own workspace and opens it. Other resumes are kept as they are. */
  setParsed: (resume: Resume, ats: AtsReport, fileName: string) => void;
  switchWorkspace: (id: string) => void;
  deleteWorkspace: (id: string) => void;
  /** Adds resumes from a backup. A resume that already exists (same id) is replaced by the backup copy. */
  importWorkspaces: (incoming: Workspace[]) => void;
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

        importWorkspaces: (incoming) => {
          const s = get();
          const current = snapshotWorkspaces(s);
          const byId = new Map(incoming.map((w) => [w.id, w]));
          const merged = [...current.map((w) => byId.get(w.id) ?? w), ...incoming.filter((w) => !current.some((c) => c.id === w.id))];
          set({ workspaces: merged });
          // Open the backup's copy if it replaced the resume on screen, or the newest import if nothing was open.
          const replacedOpen = s.activeWorkspaceId ? byId.get(s.activeWorkspaceId) : undefined;
          const newest = [...incoming].sort((a, b) => b.updatedAt - a.updatedAt)[0];
          if (replacedOpen) loadWorkspace(replacedOpen);
          else if (!s.activeWorkspaceId && newest) loadWorkspace(newest);
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
            if (status[s.id] || s.needsUserConfirmation || hasPlaceholders(s.proposed) || isStale(current, s)) continue;
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

/** True once persisted state has loaded. False during SSR and the first client render, which avoids hydration mismatches. */
export function useHydrated() {
  return useSyncExternalStore(
    (onChange) => useResumeStore.persist.onFinishHydration(onChange),
    () => useResumeStore.persist.hasHydrated(),
    () => false,
  );
}
