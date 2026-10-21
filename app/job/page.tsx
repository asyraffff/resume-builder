"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { JdInput } from "@/components/JdInput";
import { useMatchRunner } from "@/components/use-match";
import { TaskProgressBar } from "@/components/TaskProgressBar";
import type { Progress } from "@/lib/stream-progress";
import { Badge, Button, Card, ErrorNote, Header, ScoreRing, Spinner, StepNav } from "@/components/ui";
import { jobLabel, selectJobs, useHydrated, useResumeStore, type Job, type StartFrom } from "@/store/resume-store";

export default function JobsPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const state = useResumeStore();
  const { resume, fileName, activeJobId, addJob, switchJob, deleteJob, renameJob } = state;
  const jobs = selectJobs(state);
  const match = useMatchRunner();
  const [startFrom, setStartFrom] = useState<StartFrom>("original");
  const [formKey, setFormKey] = useState(0);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && !resume) router.replace("/");
  }, [hydrated, resume, router]);

  if (!hydrated || !resume) {
    return (
      <>
        <Header step={2} />
        <div className="flex justify-center p-20 text-muted"><Spinner /></div>
      </>
    );
  }

  const active = jobs.find((j) => j.id === activeJobId);
  const openInEditor = (id: string) => {
    switchJob(id);
    router.push("/editor");
  };

  return (
    <>
      <Header step={2} />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Job descriptions</h1>
        <p className="mt-1 text-sm text-muted">
          Add each job you&apos;re applying for. Every job gets its own tailored copy of your resume, match score and suggestions, saved automatically.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
          <section aria-label="Your jobs" className="min-w-0 space-y-4">
            <h2 className="text-sm font-medium text-muted">Your jobs ({jobs.length})</h2>
            {jobs.length === 0 && (
              <Card className="text-sm text-muted">No jobs yet. Add your first job description to get a match score and tailored suggestions.</Card>
            )}
            {[...jobs].reverse().map((job) => (
              <JobCard
                key={job.id}
                job={job}
                active={job.id === activeJobId}
                highlight={job.id === justAdded}
                progress={match.progress[job.id]}
                error={match.errors[job.id]}
                onOpen={() => openInEditor(job.id)}
                onMatch={() => match.run(job.id)}
                onRename={(label) => renameJob(job.id, label)}
                onDelete={() => {
                  if (confirm(`Delete "${job.label}" and its tailored resume? This can't be undone.`)) deleteJob(job.id);
                }}
              />
            ))}
          </section>

          <aside aria-label="Add a job" className="h-fit lg:sticky lg:top-20">
            <Card>
              <h2 className="font-semibold">Add a job</h2>
              <p className="mt-1 text-sm text-muted">Paste the description, share a link, or upload a screenshot.</p>

              <fieldset className="mt-4 space-y-1.5 text-sm">
                <legend className="mb-1.5 font-medium">Start this job&apos;s resume from</legend>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="radio" name="startFrom" className="mt-1" checked={startFrom === "original"} onChange={() => setStartFrom("original")} />
                  <span>
                    Your uploaded resume <span className="text-muted">{fileName ? `(${fileName})` : ""}</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="radio" name="startFrom" className="mt-1" checked={startFrom === "current"} onChange={() => setStartFrom("current")} />
                  <span>
                    A copy of {active ? <>your <span className="font-medium">{active.label}</span> resume</> : "your current draft"}
                  </span>
                </label>
              </fieldset>

              <div className="mt-4">
                <JdInput
                  key={formKey}
                  submitLabel="Add job"
                  onParsed={async (jd) => {
                    const id = addJob(jd, startFrom);
                    if (!id) return;
                    setFormKey((k) => k + 1);
                    setJustAdded(id);
                    await match.run(id);
                  }}
                />
              </div>
            </Card>
          </aside>
        </div>
      </main>
      <StepNav step={2} />
    </>
  );
}

function JobCard({
  job,
  active,
  highlight,
  progress,
  error,
  onOpen,
  onMatch,
  onRename,
  onDelete,
}: {
  job: Job;
  active: boolean;
  highlight: boolean;
  progress?: Progress;
  error?: string;
  onOpen: () => void;
  onMatch: () => void;
  onRename: (label: string) => void;
  onDelete: () => void;
}) {
  const running = !!progress;
  const [details, setDetails] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(job.label);
  const accepted = Object.values(job.suggestionStatus).filter((v) => v === "accepted").length;
  const meta = [job.jd.company, job.jd.seniority].filter(Boolean).join(" · ");

  return (
    <Card className={highlight ? "ring-2 ring-accent/40" : ""}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onRename(label);
                setRenaming(false);
              }}
            >
              <input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={jobLabel(job.jd)}
                aria-label="Job name"
                className="h-8 min-w-0 flex-1 rounded-lg border border-border px-2 text-sm outline-none focus:border-accent"
              />
              <Button size="sm" type="submit">Save</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => { setLabel(job.label); setRenaming(false); }}>Cancel</Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{job.label}</h3>
              {active && <Badge tone="accent">In editor</Badge>}
              <button className="text-xs text-muted hover:text-foreground" onClick={() => setRenaming(true)}>Rename</button>
            </div>
          )}
          <p className="mt-0.5 text-sm text-muted">{[job.jd.title !== job.label ? job.jd.title : "", meta].filter(Boolean).join(" · ")}</p>
          <p className={`mt-2 text-sm text-muted ${details ? "" : "line-clamp-2"}`}>{job.jd.summary}</p>

          {job.jd.keywords.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(details ? job.jd.keywords : job.jd.keywords.slice(0, 10)).map((k) => <Badge key={k}>{k}</Badge>)}
              {!details && job.jd.keywords.length > 10 && <Badge>+{job.jd.keywords.length - 10}</Badge>}
            </div>
          )}

          {details && (
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <DetailList title="Required" items={job.jd.requiredSkills} />
              <DetailList title="Nice to have" items={job.jd.niceToHaveSkills} />
              <div className="sm:col-span-2">
                <DetailList title="Responsibilities" items={job.jd.responsibilities} />
              </div>
            </div>
          )}
          <button className="mt-2 text-xs font-medium text-accent hover:underline" onClick={() => setDetails(!details)}>
            {details ? "Hide details" : "Show details"}
          </button>
        </div>

        <div className="w-20 shrink-0 text-center">
          {running ? (
            <div className="flex flex-col items-center gap-1 pt-4 text-xs text-muted">
              <Spinner className="text-accent" />
              Matching
            </div>
          ) : job.report ? (
            <ScoreRing score={job.report.score} label="Match" size={64} />
          ) : (
            <p className="pt-3 text-xs text-muted">Not matched yet</p>
          )}
        </div>
      </div>

      {progress && (
        <div className="mt-4 rounded-lg bg-accent-soft/50 p-3">
          <TaskProgressBar task="match" progress={progress} />
          <p className="mt-2 text-xs text-muted">You can keep working; the result is saved to this job when it&apos;s ready.</p>
        </div>
      )}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button size="sm" onClick={onOpen}>Tailor resume →</Button>
        <Button size="sm" variant="secondary" onClick={onMatch} disabled={running}>
          {job.report ? "Re-run match" : error ? "Retry match" : "Run match"}
        </Button>
        {job.report && (
          <span className="text-xs text-muted">
            {accepted} of {job.report.suggestions.length} suggestions applied
          </span>
        )}
        <Button size="sm" variant="danger" className="ml-auto" onClick={onDelete}>Delete</Button>
      </div>
    </Card>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
}
