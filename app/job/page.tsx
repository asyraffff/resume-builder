"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { JdInput } from "@/components/JdInput";
import { useMatchRunner } from "@/components/use-match";
import { JobCard } from "@/components/JobCard";
import { Card, Spinner } from "@/components/ui";
import { Header, StepNav } from "@/components/navigation";
import { selectJobs, useHydrated, useResumeStore, type StartFrom } from "@/store/resume-store";
import { confirmDialog } from "@/components/dialog";

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
                onDelete={async () => {
                  const ok = await confirmDialog({
                    title: `Delete "${job.label}"?`,
                    message: "Its tailored resume and match report will be deleted. This can't be undone.",
                    confirmLabel: "Delete",
                    danger: true,
                  });
                  if (ok) deleteJob(job.id);
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
                  onParsed={async (jd, warnings) => {
                    const id = addJob(jd, startFrom, warnings);
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
