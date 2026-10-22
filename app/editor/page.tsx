"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ResumeEditor } from "@/components/editor/ResumeEditor";
import { SuggestionsPanel } from "@/components/SuggestionsPanel";
import { JobSwitcher } from "@/components/JobSwitcher";
import { useMatchRunner } from "@/components/use-match";
import { TaskProgressBar } from "@/components/TaskProgressBar";
import { Button, ErrorNote, LinkButton, Spinner } from "@/components/ui";
import { Header, StepNav } from "@/components/navigation";
import { useHydrated, useResumeStore } from "@/store/resume-store";
import { downloadBlob, exportFileName } from "@/lib/export/shared";
import { confirmDialog } from "@/components/dialog";
import { placeholdersInResume } from "@/lib/placeholders";
import { runAtsChecks } from "@/lib/ats-checks";
import { AtsLiveCheck } from "@/components/AtsLiveCheck";
import { CompareView } from "@/components/CompareView";
import { LayoutPanel } from "@/components/LayoutPanel";
import { PreviewView } from "@/components/PreviewView";
import { PageMeter } from "@/components/PageMeter";
import { FormatToolbar } from "@/components/editor/FormatToolbar";
import { compareResumes } from "@/lib/diff";

export default function EditorPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { resume, original, jd, report, suggestionStatus, activeJobId, past, future, undo, redo, resetToOriginal } = useResumeStore();
  const [view, setView] = useState<"edit" | "compare" | "preview">("edit");
  const changeCount = useMemo(() => (resume && original ? compareResumes(original, resume).total : 0), [resume, original]);
  const match = useMatchRunner();
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progress = activeJobId ? match.progress[activeJobId] : undefined;
  const rescoring = !!progress;
  const rescoreError = activeJobId ? match.errors[activeJobId] : "";

  useEffect(() => {
    if (hydrated && !resume) router.replace("/");
  }, [hydrated, resume, router]);

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z outside text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const highlight = useMemo(() => {
    const ids = new Set<string>();
    for (const s of report?.suggestions ?? []) {
      if (suggestionStatus[s.id] !== "accepted") continue;
      if (s.target === "summary") ids.add("summary");
      else if (s.bulletId) ids.add(s.bulletId);
    }
    return ids;
  }, [report, suggestionStatus]);

  async function exportAs(kind: "pdf" | "docx") {
    if (!resume) return;
    // Warn about anything a recruiter would notice; minor issues are shown in the sidebar instead.
    const serious = runAtsChecks(resume).filter((i) => i.severity !== "low");
    if (serious.length > 0) {
      const placeholders = placeholdersInResume(resume)
        .slice(0, 5)
        .map((m) => `   ${m.where}: ${m.placeholder}`);
      const list = serious
        .map((i) => (i.topic.test("placeholder") && placeholders.length ? `• ${i.title}\n${placeholders.join("\n")}` : `• ${i.title}`))
        .join("\n");
      const ok = await confirmDialog({ title: "Before you export, these need attention", message: list, confirmLabel: "Export anyway", cancelLabel: "Go back and fix" });
      if (!ok) return;
    }
    setError(null);
    setExporting(kind);
    try {
      const blob =
        kind === "pdf"
          ? await (await import("@/lib/export/pdf")).buildPdf(resume)
          : await (await import("@/lib/export/docx")).buildDocx(resume);
      downloadBlob(blob, exportFileName(resume, jd, kind));
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
  }


  if (!hydrated || !resume) {
    return (
      <>
        <Header step={3} />
        <div className="flex justify-center p-20 text-muted"><Spinner /></div>
      </>
    );
  }

  return (
    <>
      <Header
        step={3}
        right={
          <>
            <div className="hidden gap-2 lg:flex">
              <Button variant="ghost" size="sm" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)">Undo</Button>
              <Button variant="ghost" size="sm" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)">Redo</Button>
            </div>
            <Button variant="secondary" size="sm" onClick={() => exportAs("docx")} disabled={!!exporting}>
              {exporting === "docx" ? <Spinner /> : null} Word
            </Button>
            <Button size="sm" onClick={() => exportAs("pdf")} disabled={!!exporting}>
              {exporting === "pdf" ? <Spinner /> : null} <span className="hidden sm:inline">Export</span> PDF
            </Button>
          </>
        }
      />
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[380px_1fr]">
        <aside className="h-fit rounded-xl border border-border bg-surface lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <div className="sticky top-0 z-10 border-b border-border bg-surface p-3">
            <JobSwitcher />
          </div>
          <div className="p-4">
            <div className="mb-5">
              <AtsLiveCheck resume={resume} />
            </div>
            {activeJobId ? (
              <>
                {progress ? (
                  <div className="rounded-lg bg-accent-soft/50 p-3">
                    <TaskProgressBar task="match" progress={progress} />
                    <p className="mt-2 text-xs text-muted">You can keep editing while this runs. New suggestions will replace the current ones.</p>
                  </div>
                ) : (
                  <SuggestionsPanel />
                )}
                {rescoreError && <div className="mt-4"><ErrorNote>{rescoreError}</ErrorNote></div>}
                <Button variant="secondary" size="sm" className="mt-5 w-full" onClick={() => match.run(activeJobId)} disabled={rescoring}>
                  {rescoring ? <><Spinner /> Re-checking…</> : report ? "Re-check score with my edits" : "Run match for this job"}
                </Button>
              </>
            ) : (
              <div className="space-y-3 text-sm text-muted">
                <p>You&apos;re editing your general resume. Add a job description to get a match score and tailored suggestions.</p>
                <LinkButton href="/job" size="sm" className="w-full">Add a job description</LinkButton>
              </div>
            )}
            <div className="mt-5 border-t border-border pt-4">
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: "Reset to the uploaded resume?",
                    message: "All edits to this resume will be discarded.",
                    confirmLabel: "Discard edits",
                    danger: true,
                  });
                  if (ok) resetToOriginal();
                }}
              >
                Reset to uploaded resume
              </Button>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-lg bg-surface p-1 ring-1 ring-border" role="tablist" aria-label="View">
              {(
                [
                  ["edit", "Edit"],
                  ["compare", `Compare with original${changeCount ? ` (${changeCount})` : ""}`],
                  ["preview", "Preview & layout"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1 text-sm font-medium ${view === v ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mb-3 text-xs text-muted">
            {view === "compare" ? "What changed between your uploaded resume and this version. Switch back to Edit to make changes. " : null}
            {view === "preview" ? "Exactly what the PDF will look like. Choose a template and spacing below; the Word file uses the same layout. " : null}
            {view === "edit" &&
              (jd ? <>Tailoring for <span className="font-medium text-foreground">{jd.title}{jd.company ? ` at ${jd.company}` : ""}</span>. Changes save automatically. </> : "Changes save automatically. ")}
            {view === "edit" && "Click any text to edit. Drag the ⋮⋮ handles to reorder sections, entries and bullets. Press Enter for a new bullet."}
          </p>
          {view === "preview" ? (
            <div className="space-y-4">
              <LayoutPanel resume={resume} />
              <PreviewView resume={resume} />
            </div>
          ) : view === "compare" && original ? (
            <CompareView original={original} tailored={resume} />
          ) : (
            <div className="pl-7">
              <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center justify-center gap-2">
                <FormatToolbar />
                <PageMeter resume={resume} />
              </div>
              <ResumeEditor highlight={highlight} />
            </div>
          )}
        </section>
      </main>
      <StepNav step={3} />
    </>
  );
}
