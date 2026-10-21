"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AtsReportCard } from "@/components/AtsReportCard";
import { Spinner } from "@/components/ui";
import { Header, StepNav } from "@/components/navigation";
import { useHydrated, useResumeStore } from "@/store/resume-store";

export default function AtsPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { resume, ats, fileName } = useResumeStore();

  useEffect(() => {
    if (hydrated && !resume) router.replace("/");
  }, [hydrated, resume, router]);

  if (!hydrated || !resume || !ats) {
    return (
      <>
        <Header step={1} />
        <div className="flex justify-center p-20 text-muted"><Spinner /></div>
      </>
    );
  }

  return (
    <>
      <Header step={1} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">ATS check</h1>
        <p className="mt-1 text-sm text-muted">
          How well applicant tracking systems can read {fileName ? <span className="font-medium text-foreground">{fileName}</span> : "your resume"}.
          Fix what you can, then add the jobs you&apos;re applying for.
        </p>
        <div className="mt-6">
          <AtsReportCard ats={ats} />
        </div>
      </main>
      <StepNav step={1} width="max-w-3xl" />
    </>
  );
}
