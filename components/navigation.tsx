"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useHydrated, useResumeStore, useSaveFailed } from "@/store/resume-store";
import { Button, LinkButton } from "./ui";

export const STEPS = [
  { href: "/", label: "Upload", short: "Upload" },
  { href: "/ats", label: "ATS check", short: "ATS" },
  { href: "/job", label: "Job descriptions", short: "Jobs" },
  { href: "/editor", label: "Tailor & export", short: "Tailor" },
] as const;

export type Step = 0 | 1 | 2 | 3;

export function Header({ step, right }: { step: Step; right?: ReactNode }) {
  const hydrated = useHydrated();
  const hasResume = useResumeStore((s) => !!s.resume);
  // Later steps need a resume; before hydration we can't know, so keep them disabled to avoid a flash.
  const enabled = (i: number) => i === 0 || (hydrated && hasResume);

  const saveFailed = useSaveFailed();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-5">
        <Link href="/" className="shrink-0 font-semibold tracking-tight">
          Resume<span className="text-accent">Tailor</span>
        </Link>
        <nav className="flex min-w-0 items-center gap-0.5 text-sm" aria-label="Steps">
          {STEPS.map((s, i) => {
            const current = i === step;
            const base = "whitespace-nowrap rounded-md px-2 py-1 transition";
            const label = (
              <>
                <span className="tabular-nums">{i + 1}</span>
                <span className="hidden sm:inline">. </span>
                <span className="hidden lg:inline">{s.label}</span>
                <span className="hidden sm:inline lg:hidden">{s.short}</span>
              </>
            );
            return (
              <span key={s.href} className="flex items-center gap-0.5" title={s.label}>
                {i > 0 && <span className="text-muted/50" aria-hidden>›</span>}
                {current ? (
                  <span aria-current="step" className={`${base} bg-accent-soft font-medium text-accent`}>{label}</span>
                ) : enabled(i) ? (
                  <Link href={s.href} className={`${base} text-muted hover:bg-background hover:text-foreground`}>{label}</Link>
                ) : (
                  <span aria-disabled="true" title="Upload a resume first" className={`${base} cursor-not-allowed text-muted/50`}>{label}</span>
                )}
              </span>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>
      </div>
      {saveFailed && (
        <div role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-bad">
          Your latest changes couldn&apos;t be saved because this browser&apos;s storage is full. Back up your resumes from the Upload page,
          then delete ones you no longer need.
        </div>
      )}
    </header>
  );
}

/** Back / Next buttons at the bottom of each step. */
export function StepNav({ step, nextDisabled, nextHint, width = "max-w-7xl" }: { step: Step; nextDisabled?: boolean; nextHint?: string; width?: string }) {
  const back = step > 0 ? STEPS[step - 1] : null;
  const next = step < STEPS.length - 1 ? STEPS[step + 1] : null;
  return (
    <nav aria-label="Step navigation" className={`mx-auto mt-2 flex ${width} items-center justify-between gap-3 border-t border-border px-4 py-6`}>
      {back ? (
        <LinkButton href={back.href} variant="secondary">
          ← Back: {back.label}
        </LinkButton>
      ) : (
        <span />
      )}
      {next && (
        <div className="flex items-center gap-3">
          {nextDisabled && nextHint && <span className="hidden text-sm text-muted sm:inline">{nextHint}</span>}
          {nextDisabled ? (
            <Button disabled title={nextHint}>Next: {next.label} →</Button>
          ) : (
            <LinkButton href={next.href}>Next: {next.label} →</LinkButton>
          )}
        </div>
      )}
    </nav>
  );
}
