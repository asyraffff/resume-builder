"use client";

import { useState } from "react";
import { useResumeStore } from "@/store/resume-store";
import type { MetricHint, Resume, Suggestion } from "@/lib/schemas";
import { fillPlaceholder, findPlaceholders, hasPlaceholders } from "@/lib/placeholders";
import { Badge, Button, ScoreRing } from "./ui";

const KIND_LABEL: Record<string, string> = {
  "rewrite:summary": "New summary",
  "rewrite:bullet": "Rewrite bullet",
  "add:bullet": "Add bullet",
  "remove:bullet": "Remove bullet",
  "add:skills": "Add skill",
  "rewrite:section": "Rename section",
};

function contextLabel(r: Resume, s: Suggestion) {
  if (s.target === "summary") return "Summary";
  const sec = r.sections.find((x) => x.id === s.sectionId);
  const it = sec?.items.find((x) => x.id === s.itemId);
  return [sec?.title, it?.heading || it?.subheading].filter(Boolean).join(" › ");
}

export function SuggestionsPanel() {
  const { resume, report, suggestionStatus, acceptSuggestion, rejectSuggestion, acceptAllSafe, applySuggestedOrder } = useResumeStore();
  const [showDone, setShowDone] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  if (!resume || !report) {
    return <p className="text-sm text-muted">No match yet for this job. Run the match below to get a score and suggestions.</p>;
  }

  const pending = report.suggestions.filter((s) => !suggestionStatus[s.id]);
  const done = report.suggestions.filter((s) => suggestionStatus[s.id]);
  const safeCount = pending.filter((s) => !s.needsUserConfirmation && !hasPlaceholders(s.proposed)).length;
  const orderChanged = report.suggestedSectionOrder.join() !== resume.sections.filter((s) => report.suggestedSectionOrder.includes(s.id)).map((s) => s.id).join();

  const note = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <ScoreRing score={report.score} label="Job match" size={76} />
        <div className="grid flex-1 gap-1.5 text-xs">
          {(
            [
              ["Keywords", report.breakdown.keywordCoverage],
              ["Experience", report.breakdown.experienceRelevance],
              ["Seniority", report.breakdown.seniorityFit],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-20 text-muted">{label}</span>
              <div className="h-1.5 flex-1 rounded-full bg-background">
                <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
              </div>
              <span className="w-7 text-right tabular-nums">{Math.round(v)}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted">{report.summary}</p>

      {report.missingKeywords.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">Missing keywords</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {report.missingKeywords.map((k) => (
              <span key={k.keyword} title={k.note}>
                <Badge tone={k.truthfullyAddable ? "accent" : "neutral"}>
                  {k.keyword}
                  {!k.truthfullyAddable && " *"}
                </Badge>
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">Blue: your resume already supports it. * means you&apos;d need real experience to add it. Hover a keyword for details.</p>
        </div>
      )}

      {report.matchedKeywords.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Matched keywords ({report.matchedKeywords.length})</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {report.matchedKeywords.map((k) => <Badge key={k} tone="good">{k}</Badge>)}
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
        <div className="mt-2 space-y-3">
          {pending.map((s) => (
            <SuggestionCard
              key={s.id}
              s={s}
              context={contextLabel(resume, s)}
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

function SuggestionCard({
  s,
  context,
  onAccept,
  onReject,
}: {
  s: Suggestion;
  context: string;
  onAccept: (override?: string) => void;
  onReject: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.proposed);
  const hints = s.metricHints ?? []; // reports saved before metric hints existed have none
  const open = s.kind === "remove" ? [] : findPlaceholders(draft);
  const noNumberVersion = hints.find((h) => h.noNumberVersion.trim())?.noNumberVersion;
  const changed = draft !== s.proposed;

  return (
    <div className={`rounded-lg border p-3 ${s.needsUserConfirmation ? "border-amber-300 bg-amber-50/40" : "border-border"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="accent">{KIND_LABEL[`${s.kind}:${s.target}`] ?? s.kind}</Badge>
        <span className="truncate text-muted">{context}</span>
      </div>

      {s.original && (
        <p className={`mt-2 text-sm ${s.kind === "remove" ? "text-bad line-through" : "text-muted line-through decoration-neutral-400"}`}>{s.original}</p>
      )}
      {s.kind !== "remove" &&
        (editing ? (
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="mt-2 h-24 w-full rounded border border-border p-2 text-sm outline-none focus:border-accent" />
        ) : (
          <p className="mt-2 text-sm">
            <WithPlaceholders text={draft} />
          </p>
        ))}

      <p className="mt-2 text-xs text-muted">{s.reason}</p>
      {s.needsUserConfirmation && open.length === 0 && (
        <p className="mt-2 text-xs font-medium text-warn">Check this is true before accepting.</p>
      )}

      {open.length > 0 && (
        <div className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-white p-3">
          <p className="text-xs font-medium text-warn">
            Fill in {open.length === 1 ? "the number" : `${open.length} numbers`} with what&apos;s true for you, or use the version without numbers.
          </p>
          {open.map((ph) => (
            <MetricHelper
              key={ph}
              placeholder={ph}
              hint={hints.find((h) => h.placeholder.trim() === ph)}
              onFill={(value) => setDraft((d) => fillPlaceholder(d, ph, value))}
            />
          ))}
          {noNumberVersion && (
            <button className="text-xs font-medium text-accent hover:underline" onClick={() => setDraft(noNumberVersion)}>
              Use a version without numbers
            </button>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!draft.trim() || open.length > 0}
          title={open.length > 0 ? "Fill in the numbers first" : undefined}
          onClick={() => onAccept(changed || editing ? draft : undefined)}
        >
          {editing ? "Save & apply" : "Accept"}
        </Button>
        {s.kind !== "remove" && !editing && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
        )}
        {editing ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Done</Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onReject}>Dismiss</Button>
        )}
        {changed && (
          <button className="ml-auto text-xs text-muted hover:text-foreground" onClick={() => setDraft(s.proposed)}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

/** Renders text with [placeholders] highlighted so they're impossible to miss. */
function WithPlaceholders({ text }: { text: string }) {
  const parts = text.split(/(\[[^\[\]\n]{1,80}\])/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\[.*\]$/.test(p) ? (
          <mark key={i} className="rounded bg-amber-100 px-1 text-amber-900">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function MetricHelper({ placeholder, hint, onFill }: { placeholder: string; hint?: MetricHint; onFill: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="space-y-1.5 border-t border-amber-100 pt-3 first-of-type:border-0 first-of-type:pt-0">
      <p className="text-sm">
        <mark className="rounded bg-amber-100 px-1 text-amber-900">{placeholder}</mark>
      </p>
      {hint?.question && <p className="text-sm font-medium">{hint.question}</p>}
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && onFill(value)}
          placeholder="Your real number"
          aria-label={`Value for ${placeholder}`}
          className="h-8 min-w-0 flex-1 rounded-lg border border-border px-2 text-sm outline-none focus:border-accent"
        />
        <Button size="sm" variant="secondary" disabled={!value.trim()} onClick={() => onFill(value)}>Use</Button>
      </div>
      {hint && hint.examples.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Examples:</span>
          {hint.examples.map((ex) => (
            <button
              key={ex}
              onClick={() => setValue(ex)}
              title="Put this in the box so you can adjust it before using it"
              className="rounded-full border border-border px-2 py-0.5 hover:border-accent hover:text-accent"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
      {hint?.typicalRange && (
        <p className="text-xs text-muted">
          <span className="font-medium text-foreground">Typical for this kind of work:</span> {hint.typicalRange}. Only use what you can back up in an interview.
        </p>
      )}
      {hint?.howToFind && (
        <p className="text-xs text-muted">
          <span className="font-medium text-foreground">Where to find it:</span> {hint.howToFind}
        </p>
      )}
    </div>
  );
}
