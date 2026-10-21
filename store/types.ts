import type { AtsReport, JobDescription, MatchReport, Resume } from "@/lib/schemas";

export type SuggestionStatus = "accepted" | "rejected" | "failed";

/** One job the user is applying for, with its own tailored resume. */
export type Job = {
  id: string;
  label: string;
  jd: JobDescription;
  resume: Resume;
  report: MatchReport | null;
  suggestionStatus: Record<string, SuggestionStatus>;
  /** Excerpts of text in the posting that was aimed at AI tools (ignored during analysis). */
  warnings?: string[];
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

export type State = {
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

export const jobLabel = (jd: JobDescription | null) => [jd?.company, jd?.title].filter(Boolean).join(" – ") || "Untitled job";
