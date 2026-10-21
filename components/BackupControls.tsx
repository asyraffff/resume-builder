"use client";

import { useRef, useState } from "react";
import { BackupError, MAX_BACKUP_BYTES, backupFileName, createBackup, describeImport, parseBackup } from "@/lib/backup";
import { downloadBlob } from "@/lib/export/shared";
import { selectWorkspaces, useResumeStore } from "@/store/resume-store";
import { Button } from "./ui";

/** Back up every saved resume to a file, or restore from one. */
export function BackupControls({ compact }: { compact?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importWorkspaces = useResumeStore((s) => s.importWorkspaces);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  function backUp() {
    const workspaces = selectWorkspaces(useResumeStore.getState());
    if (!workspaces.length) return;
    const blob = new Blob([JSON.stringify(createBackup(workspaces), null, 2)], { type: "application/json" });
    downloadBlob(blob, backupFileName());
    const jobs = workspaces.reduce((n, w) => n + w.jobs.length, 0);
    setMessage({
      tone: "good",
      text: `Backed up ${workspaces.length} resume${workspaces.length > 1 ? "s" : ""} and ${jobs} job${jobs === 1 ? "" : "s"}. Keep the file somewhere safe.`,
    });
  }

  async function restore(file: File) {
    setMessage(null);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new BackupError("That file is too large to be a backup.");
      const incoming = parseBackup(await file.text());
      if (!incoming.length) throw new BackupError("That backup doesn't contain any resumes.");
      const { added, replaced, total } = describeImport(selectWorkspaces(useResumeStore.getState()), incoming);
      const detail = replaced ? `\n\n${replaced} of them already exist here and will be replaced by the backup copy.` : "";
      if (!confirm(`Restore ${total} resume${total > 1 ? "s" : ""} from "${file.name}"?${detail}`)) return;
      importWorkspaces(incoming);
      setMessage({
        tone: "good",
        text: [added && `Added ${added} resume${added > 1 ? "s" : ""}`, replaced && `replaced ${replaced}`].filter(Boolean).join(", ") + " from the backup.",
      });
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof BackupError ? e.message : "Couldn't read that file." });
    }
  }

  const hasData = useResumeStore((s) => s.workspaces.length > 0 || !!s.resume);

  return (
    <div className={compact ? "" : "mt-3"}>
      <div className="flex flex-wrap items-center gap-2">
        {hasData && (
          <Button size="sm" variant="secondary" onClick={backUp} title="Download all your resumes, jobs and tailored versions as one file">
            Back up all
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} title="Load resumes from a backup file">
          Restore from backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) restore(f);
          }}
        />
      </div>
      {message && (
        <p role="status" className={`mt-2 text-xs ${message.tone === "good" ? "text-good" : "text-bad"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
