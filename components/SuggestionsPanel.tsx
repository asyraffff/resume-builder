"use client";

import { useState } from "react";
import { useResumeStore } from "@/store/resume-store";
import type { Resume, Suggestion } from "@/lib/schemas";
import { hasPlaceholders } from "@/lib/placeholders";
import { Badge, Button, ScoreRing } from "./ui";
import { SuggestionCard } from "./SuggestionCard";
import { liveScore } from "@/lib/keywords";
import { currentTextFor, isStale } from "@/lib/apply-suggestion";

function contextLabel(r: Resume, s: Suggestion) {
  if (s.target === "summary") return "Summary";
  const sec = r.sections.find((x) => x.id === s.sectionId);
  const it = sec?.items.find((x) => x.id === s.itemId);
  return [sec?.title, it?.heading || it?.subheading].filter(Boolean).join(" › ");
}

export function SuggestionsPanel() {
  const { resume, jd, report, suggestionStatus, acceptSuggestion, rejectSuggestion, acceptAllSafe, applySuggestedOrder } = useResumeStore();
  const [showDone, setShowDone] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  if (!resume || !report || !jd) {
    return <p className="text-sm text-muted">No match yet for this job. Run the match below to get a score and suggestions.</p>;
  }

  const live = liveScore(report, resume, jd);
  // The AI's notes on missing keywords, used to say which ones the resume can honestly add.
  const aiNotes = new Map(report.missingKeywords.map((k) => [k.keyword.toLowerCase(), k]));
  const pending = report.suggestions.filter((s) => !suggestionStatus[s.id]);
  const done = report.suggestions.filter((s) => suggestionStatus[s.id]);
  const staleIds = new Set(pending.filter((s) => isStale(resume, s)).map((s) => s.id));
  const safeCount = pending.filter((s) => !s.needsUserConfirmation && !hasPlaceholders(s.proposed) && !staleIds.has(s.id)).length;
  const orderChanged = report.suggestedSectionOrder.join() !== resume.sections.filter((s) => report.suggestedSectionOrder.includes(s.id)).map((s) => s.id).join();

  const note = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <ScoreRing score={live.score} label="Job match" size={76} />
        <div className="grid flex-1 gap-1.5 text-xs">
          {(
            [
              ["Keywords", live.keywords, "Share of the job's keywords found in your resume. Updates as you edit."],
              ["Experience", live.experience, "How relevant your experience is, judged by the AI at the last match."],
              ["Seniority", live.seniority, "How well your level fits the role, judged by the AI at the last match."],
            ] as const
          ).map(([label, v, help]) => (
            <div key={label} className="flex items-center gap-2" title={help}>
              <span className="w-20 text-muted">{label}</span>
              <div className="h-1.5 flex-1 rounded-full bg-background">
                <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
              </div>
              <span className="w-7 text-right tabular-nums">{Math.round(v)}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">
        Keywords update live as you edit. Experience and seniority come from the last match; re-check to refresh them.
      </p>
      <p className="text-sm text-muted">{report.summary}</p>

      {live.coverage.missing.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">Missing keywords ({live.coverage.missing.length})</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {live.coverage.missing.map((k) => {
              const note = aiNotes.get(k.toLowerCase());
              const addable = note?.truthfullyAddable;
              return (
                <span key={k} title={note?.note}>
                  <Badge tone={addable ? "accent" : "neutral"}>
                    {k}
                    {addable === false && " *"}
                  </Badge>
                </span>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted">Blue: your resume already supports it. * means you&apos;d need real experience to add it. Hover a keyword for details.</p>
        </div>
      )}

      {live.coverage.matched.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Matched keywords ({live.coverage.matched.length})</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {live.coverage.matched.map((k) => <Badge key={k} tone="good">{k}</Badge>)}
          </div>
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!safeCount} onClick={() => note(`Applied ${acceptAllSafe()} suggestions.`)}>
          Accept all safe ({safeCount})
        </Button>
        {orderChanged && report.suggestedSectionOrder.length > 1 && (
          <Button size="sm" variant="secondary" onClick={() => { applySuggestedOrder(); note("Sections reordered."); }}>
            Use suggested section order
          </Button>
        )}
      </div>
      {flash && <p className="text-sm text-good" role="status">{flash}</p>}

      <div>
        <h3 className="text-sm font-medium">Suggestions ({pending.length} to review)</h3>
        {staleIds.size > 0 && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-warn">
            {staleIds.size} suggestion{staleIds.size > 1 ? "s were" : " was"} made before your latest edits. They&apos;re marked below and
            aren&apos;t included in &ldquo;Accept all safe&rdquo;, so your edits won&apos;t be overwritten by accident.
          </p>
        )}
        <div className="mt-2 space-y-3">
          {pending.map((s) => (
            <SuggestionCard
              key={s.id}
              s={s}
              context={contextLabel(resume, s)}
              stale={staleIds.has(s.id)}
              current={currentTextFor(resume, s)}
              onAccept={(override) => {
                if (!acceptSuggestion(s.id, override)) note("That part of the resume has changed, so this suggestion can't be applied.");
              }}
              onReject={() => rejectSuggestion(s.id)}
            />
          ))}
          {pending.length === 0 && <p className="text-sm text-muted">All suggestions reviewed. Re-check the score to see your new match.</p>}
        </div>
      </div>

      {done.length > 0 && (
        <div>
          <button className="text-sm text-muted hover:text-foreground" onClick={() => setShowDone(!showDone)}>
            {showDone ? "Hide" : "Show"} reviewed ({done.length})
          </button>
          {showDone && (
            <ul className="mt-2 space-y-1 text-xs">
              {done.map((s) => (
                <li key={s.id} className="flex gap-2">
                  <Badge tone={suggestionStatus[s.id] === "accepted" ? "good" : suggestionStatus[s.id] === "failed" ? "warn" : "neutral"}>
                    {suggestionStatus[s.id]}
                  </Badge>
                  <span className="truncate text-muted">{s.proposed || s.original}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
