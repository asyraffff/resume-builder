import { z } from "zod";
import { AtsIssue, JobDescription, MatchReport, MetricHint, Resume, Suggestion } from "./schemas";
import type { Job, Workspace } from "@/store/resume-store";

/**
 * Backup file format. Bump BACKUP_FORMAT and add a migration in parseBackup() if the shape changes,
 * so older backups keep importing (this file is also how browser data will move into accounts later).
 */
export const BACKUP_APP = "resume-tailor";
export const BACKUP_FORMAT = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

// Reports saved before metric hints existed don't have them, so they're optional here.
const BackupReport = MatchReport.extend({
  suggestions: z.array(Suggestion.extend({ metricHints: z.array(MetricHint).optional() })),
});

const SuggestionStatus = z.record(z.string(), z.enum(["accepted", "rejected", "failed"]));

const BackupJob = z.object({
  id: z.string().min(1),
  label: z.string(),
  jd: JobDescription,
  resume: Resume,
  report: BackupReport.nullable(),
  suggestionStatus: SuggestionStatus,
  createdAt: z.number(),
  updatedAt: z.number(),
});

const BackupWorkspace = z.object({
  id: z.string().min(1),
  fileName: z.string(),
  original: Resume,
  ats: z.object({ score: z.number(), summary: z.string(), issues: z.array(AtsIssue), strengths: z.array(z.string()) }).nullable(),
  resume: Resume,
  jd: JobDescription.nullable(),
  report: BackupReport.nullable(),
  suggestionStatus: SuggestionStatus,
  jobs: z.array(BackupJob),
  activeJobId: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const BackupFile = z.object({
  app: z.literal(BACKUP_APP),
  format: z.number().int(),
  exportedAt: z.string(),
  workspaces: z.array(BackupWorkspace),
});

export type BackupFile = z.infer<typeof BackupFile>;

export function createBackup(workspaces: Workspace[], now = new Date()): BackupFile {
  return { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: now.toISOString(), workspaces };
}

export function backupFileName(now = new Date()) {
  const d = now.toISOString().slice(0, 10);
  return `resume-tailor-backup-${d}.json`;
}

export class BackupError extends Error {}

/** Validates a backup file's text and returns its resumes. Throws BackupError with a user-facing message. */
export function parseBackup(text: string): Workspace[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("That file isn't a valid backup (it's not JSON).");
  }
  if (!raw || typeof raw !== "object" || (raw as { app?: unknown }).app !== BACKUP_APP) {
    throw new BackupError("That file isn't a Resume Tailor backup.");
  }
  const format = (raw as { format?: unknown }).format;
  if (typeof format === "number" && format > BACKUP_FORMAT) {
    throw new BackupError("This backup was made by a newer version of the app. Update the app and try again.");
  }
  const parsed = BackupFile.safeParse(raw);
  if (!parsed.success) {
    throw new BackupError("This backup is damaged or incomplete, so nothing was imported.");
  }
  // Fill in fields that older reports may lack so the rest of the app sees the current shape.
  return parsed.data.workspaces.map((w) => ({
    ...w,
    report: normaliseReport(w.report),
    jobs: w.jobs.map((j): Job => ({ ...j, report: normaliseReport(j.report) })),
  }));
}

function normaliseReport(r: z.infer<typeof BackupReport> | null): MatchReport | null {
  if (!r) return null;
  return { ...r, suggestions: r.suggestions.map((s) => ({ ...s, metricHints: s.metricHints ?? [] })) };
}

/** How an import will change the saved resumes, for the confirmation message. */
export function describeImport(existing: Workspace[], incoming: Workspace[]) {
  const ids = new Set(existing.map((w) => w.id));
  const replaced = incoming.filter((w) => ids.has(w.id)).length;
  return { added: incoming.length - replaced, replaced, total: incoming.length };
}
