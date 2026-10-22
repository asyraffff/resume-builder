"use client";

import Link from "next/link";
import { deleteAllLocalData } from "@/lib/privacy";
import { useResumeStore } from "@/store/resume-store";
import { confirmDialog } from "./dialog";

/** Footer on every page: privacy policy and a way to wipe everything stored in this browser. */
export function SiteFooter() {
  const startOver = useResumeStore((s) => s.startOver);

  async function deleteAll() {
    const ok = await confirmDialog({
      title: "Delete all your data from this browser?",
      message:
        "This removes every resume, job, tailored version and setting saved here. " +
        'It can\'t be undone, so use "Back up all" first if you might want them later.',
      confirmLabel: "Delete everything",
      danger: true,
    });
    if (!ok) return;
    startOver();
    deleteAllLocalData();
    // Persisted state is gone; a full page load (not client-side navigation) makes sure nothing stays in memory either.
    window.location.assign(new URL("/", window.location.origin).href);
  }

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 text-xs text-muted">
        <span>Resume Tailor</span>
        <Link href="/privacy" className="hover:text-foreground hover:underline">
          Privacy
        </Link>
        <button type="button" onClick={deleteAll} className="hover:text-bad hover:underline">
          Delete all my data
        </button>
        <span className="ml-auto">Your resumes are stored only in this browser.</span>
      </div>
    </footer>
  );
}
