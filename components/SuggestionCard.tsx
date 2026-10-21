"use client";

import { useState } from "react";
import type { MetricHint, Suggestion } from "@/lib/schemas";
import { fillPlaceholder, findPlaceholders } from "@/lib/placeholders";
import { Badge, Button } from "./ui";

const KIND_LABEL: Record<string, string> = {
  "rewrite:summary": "New summary",
  "rewrite:bullet": "Rewrite bullet",
  "add:bullet": "Add bullet",
  "remove:bullet": "Remove bullet",
  "add:skills": "Add skill",
  "rewrite:section": "Rename section",
};

/** One suggestion with accept / edit / dismiss, and help filling in any [placeholder] metrics. */
export function SuggestionCard({
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
