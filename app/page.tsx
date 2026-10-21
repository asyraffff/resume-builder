"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, ErrorNote, Header, StepNav } from "@/components/ui";
import { TaskProgressBar } from "@/components/TaskProgressBar";
import { runStream } from "@/components/stream-client";
import type { Progress } from "@/lib/stream-progress";
import { selectWorkspaces, useHydrated, useResumeStore, type Workspace } from "@/store/resume-store";
import type { ParseResult } from "@/lib/schemas";

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [uploadingName, setUploadingName] = useState("");
  const busy = progress !== null;
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();
  const state = useResumeStore();
  const { setParsed, resume, activeWorkspaceId, switchWorkspace, deleteWorkspace } = state;
  const workspaces = selectWorkspaces(state);
  const sorted = [...workspaces].sort((a, b) => b.updatedAt - a.updatedAt);

  async function upload(file: File) {
    setError(null);
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setError("Please upload a PDF or Word (.docx) file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("The file is larger than 5 MB.");
      return;
    }
    setUploadingName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await runStream<ParseResult>("parse", "/api/parse-resume", { body: fd }, setProgress);
      setParsed(data.resume, data.ats, data.fileName);
      router.push("/analyze");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      <Header step={0} />
      <main className="mx-auto max-w-3xl px-4 pb-4 pt-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Tailor your resume to the job.</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Upload your resume, get an ATS check, add the jobs you&apos;re applying for, and review honest, targeted suggestions. Then
          rearrange the blocks and export to PDF or Word. You can keep several resumes here and switch between them.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f && !busy) upload(f);
          }}
          className={`mt-8 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
            dragging ? "border-accent bg-accent-soft" : "border-border bg-surface"
          }`}
        >
          {progress ? (
            <div className="w-full max-w-lg text-left">
              <p className="mb-4 truncate text-center text-sm text-muted">
                <span className="font-medium text-foreground">{uploadingName}</span>
              </p>
              <TaskProgressBar task="parse" progress={progress} />
              <p className="mt-4 text-center text-xs text-muted">We extract every section and run the ATS check. Keep this page open.</p>
            </div>
          ) : (
            <>
              <p className="font-medium">{workspaces.length ? "Upload another resume" : "Drag and drop your resume here"}</p>
              <p className="mt-1 text-sm text-muted">PDF or DOCX, up to 5 MB</p>
              <Button className="mt-5" onClick={() => inputRef.current?.click()}>
                Choose file
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) upload(f);
                }}
              />
            </>
          )}
        </div>

        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

        {hydrated && workspaces.length > 0 && (
          <section aria-label="Your resumes" className="mt-8">
            <h2 className="text-sm font-medium text-muted">Your resumes ({workspaces.length})</h2>
            <ul className="mt-2 space-y-2">
              {sorted.map((w) => (
                <ResumeRow
                  key={w.id}
                  w={w}
                  active={w.id === activeWorkspaceId}
                  disabled={busy}
                  onContinue={() => {
                    switchWorkspace(w.id);
                    router.push(w.jobs.length ? "/editor" : "/analyze");
                  }}
                  onDelete={() => {
                    const jobs = w.jobs.length ? ` and its ${w.jobs.length} tailored version${w.jobs.length > 1 ? "s" : ""}` : "";
                    if (confirm(`Delete "${w.fileName || w.original.contact.name}"${jobs}? This can't be undone.`)) deleteWorkspace(w.id);
                  }}
                />
              ))}
            </ul>
          </section>
        )}
      </main>

      <StepNav step={0} width="max-w-3xl" nextDisabled={!hydrated || !resume} nextHint="Upload a resume first" />

      <footer className="mt-6 border-t border-border bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h2 className="text-sm font-medium text-muted">How it works</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-3">
            {[
              ["ATS check", "Find formatting and content problems that stop applicant tracking systems from reading your resume."],
              ["Job descriptions", "Add one or more jobs by pasting the text, sharing a link, or uploading a screenshot. See your fit score for each."],
              ["Tailor & export", "Get a tailored resume per job: accept suggestions, drag sections into place, and export to PDF or Word."],
            ].map(([t, d], i) => (
              <div key={t}>
                <p className="font-medium">
                  <span className="mr-1.5 tabular-nums text-accent">{i + 2}.</span>
                  {t}
                </p>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-xs text-muted">
            Privacy: your file is sent to the AI for analysis and is not stored on our server. Your resumes and drafts are kept only in this
            browser.
          </p>
        </div>
      </footer>
    </>
  );
}

function ResumeRow({
  w,
  active,
  disabled,
  onContinue,
  onDelete,
}: {
  w: Workspace;
  active: boolean;
  disabled: boolean;
  onContinue: () => void;
  onDelete: () => void;
}) {
  const scored = w.jobs.filter((j) => j.report);
  const best = scored.length ? Math.max(...scored.map((j) => j.report!.score)) : null;
  const details = [
    w.original.contact.name,
    w.ats ? `ATS ${Math.round(w.ats.score)}` : "",
    w.jobs.length ? `${w.jobs.length} job${w.jobs.length > 1 ? "s" : ""}${best !== null ? ` · best match ${Math.round(best)}` : ""}` : "No jobs yet",
    `edited ${timeAgo(w.updatedAt)}`,
  ].filter(Boolean);

  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-xl border bg-surface p-4 ${active ? "border-accent/40 ring-1 ring-accent/20" : "border-border"}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate font-medium">{w.fileName || w.original.contact.name || "Untitled resume"}</span>
          {active && <Badge tone="accent">Open</Badge>}
        </p>
        <p className="truncate text-xs text-muted">{details.join(" · ")}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onContinue} disabled={disabled}>
          Continue
        </Button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          aria-label={`Delete ${w.fileName || "resume"}`}
          title="Delete this resume"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-red-50 hover:text-bad disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.75 7v4M9.25 7v4" />
          </svg>
        </button>
      </div>
    </li>
  );
}

function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
