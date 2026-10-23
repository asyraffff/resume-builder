"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { giveConsent, hasConsent } from "@/lib/privacy";
import { useRouter } from "next/navigation";
import { Button, ErrorNote } from "@/components/ui";
import { Header, StepNav } from "@/components/navigation";
import { ResumeRow } from "@/components/ResumeRow";
import { TaskProgressBar } from "@/components/TaskProgressBar";
import { BackupControls } from "@/components/BackupControls";
import { confirmDialog } from "@/components/dialog";
import { LimitReachedError, runStream } from "@/components/stream-client";
import { LimitCard, UsageHint } from "@/components/usage";
import type { Progress } from "@/lib/stream-progress";
import { selectWorkspaces, useHydrated, useResumeStore } from "@/store/resume-store";
import type { ParseResult } from "@/lib/schemas";
import { SAMPLE_FILE_NAME, sampleAts, sampleJob, sampleReport, sampleResume } from "@/lib/sample";

const noSubscribe = () => () => {};

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
  // Consent is read from this browser's storage; the server render assumes "not yet" and the checkbox appears after load.
  const storedConsent = useSyncExternalStore(noSubscribe, hasConsent, () => false);
  const [justAgreed, setJustAgreed] = useState(false);
  const consented = storedConsent || justAgreed;
  const state = useResumeStore();
  const { setParsed, resume, activeWorkspaceId, switchWorkspace, deleteWorkspace, addJob, setReportFor } = state;
  const workspaces = selectWorkspaces(state);
  const sorted = [...workspaces].sort((a, b) => b.updatedAt - a.updatedAt);

  async function upload(file: File) {
    setError(null);
    if (!consented) {
      setError("Please confirm the note above before uploading.");
      return;
    }
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setError("Please upload a PDF or Word (.docx) file.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("The file is larger than 4 MB.");
      return;
    }
    setUploadingName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await runStream<ParseResult>("parse", "/api/parse-resume", { body: fd }, setProgress);
      setParsed(data.resume, data.ats, data.fileName);
      router.push("/ats");
    } catch (e) {
      if (e instanceof LimitReachedError) return; // the usage card explains when to try again
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  }

  /** Loads the built-in sample (no upload, no AI) so people can see every step first. Reuses it if already loaded. */
  function trySample() {
    const existing = workspaces.find((w) => w.fileName === SAMPLE_FILE_NAME);
    if (existing) {
      switchWorkspace(existing.id);
    } else {
      setParsed(structuredClone(sampleResume), structuredClone(sampleAts), SAMPLE_FILE_NAME);
      const jobId = addJob(structuredClone(sampleJob), "original");
      setReportFor(jobId, structuredClone(sampleReport));
    }
    router.push("/ats");
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
              <p className="mt-1 text-sm text-muted">PDF or DOCX, up to 4 MB</p>
              {hydrated && !consented && (
                <label className="mt-5 flex max-w-md cursor-pointer items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    onChange={(e) => {
                      if (!e.target.checked) return;
                      giveConsent();
                      setJustAgreed(true);
                      setError(null);
                    }}
                  />
                  <span>
                    I understand my resume will be sent to Anthropic&apos;s Claude AI to be analysed. It isn&apos;t stored on this
                    site&apos;s server, and my saved work stays in this browser.{" "}
                    <Link href="/privacy" className="text-accent underline underline-offset-2" target="_blank">
                      Privacy details
                    </Link>
                  </span>
                </label>
              )}
              <Button className="mt-5" onClick={() => inputRef.current?.click()} disabled={!consented}>
                Choose file
              </Button>
              <UsageHint route="parse-resume" className="mt-2" />
              {!sorted.some((w) => w.fileName === SAMPLE_FILE_NAME) && (
                <button type="button" onClick={trySample} className="mt-3 text-sm text-accent hover:underline">
                  No resume to hand? Try a sample
                </button>
              )}
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
        <LimitCard route="parse-resume" className="mt-4" />

        {/* One instance in a fixed place, so its status message survives the list appearing or disappearing. */}
        {hydrated && !busy && (
          <div className="mt-4 flex flex-wrap items-start justify-end gap-2 text-sm text-muted">
            {workspaces.length === 0 && <span className="pt-1.5">Have a backup file?</span>}
            <BackupControls compact />
          </div>
        )}

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
                    router.push(w.jobs.length ? "/editor" : "/ats");
                  }}
                  onDelete={async () => {
                    const jobs = w.jobs.length ? ` and its ${w.jobs.length} tailored version${w.jobs.length > 1 ? "s" : ""}` : "";
                    const ok = await confirmDialog({
                      title: `Delete "${w.fileName || w.original.contact.name}"?`,
                      message: `This resume${jobs} will be deleted from this browser. This can't be undone.`,
                      confirmLabel: "Delete",
                      danger: true,
                    });
                    if (ok) deleteWorkspace(w.id);
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
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {[
              ["Upload", "Add your resume as a PDF or Word file. You can keep several resumes and switch between them."],
              ["ATS check", "Find formatting and content problems that stop applicant tracking systems from reading your resume."],
              ["Job descriptions", "Add one or more jobs by pasting the text, sharing a link, or uploading a screenshot. See your fit score for each."],
              ["Tailor & export", "Get a tailored resume per job: accept suggestions, drag sections into place, and export to PDF or Word."],
            ].map(([t, d], i) => (
              <div key={t}>
                <p className="font-medium">
                  <span className="mr-1.5 tabular-nums text-accent">{i + 1}.</span>
                  {t}
                </p>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}
