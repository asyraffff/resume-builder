"use client";

import { useMemo, useState } from "react";
import { compareResumes, wordDiff, type BulletDiff, type ItemDiff, type Kind } from "@/lib/diff";
import type { Resume } from "@/lib/schemas";

/** Side-by-side-in-one view of what changed between the uploaded resume and the tailored version. */
export function CompareView({ original, tailored }: { original: Resume; tailored: Resume }) {
  const diff = useMemo(() => compareResumes(original, tailored), [original, tailored]);
  const [onlyChanges, setOnlyChanges] = useState(true);
  const { counts } = diff;
  const show = (k: Kind) => !onlyChanges || k !== "same";

  return (
    <div className="mx-auto w-full max-w-[820px] rounded-sm bg-white px-6 py-8 text-[14px] leading-relaxed text-neutral-900 shadow-sm ring-1 ring-border sm:px-12 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="font-semibold">
            {diff.total === 0 ? "No changes yet" : `${diff.total} change${diff.total > 1 ? "s" : ""} from your uploaded resume`}
          </p>
          {diff.total > 0 && (
            <p className="mt-0.5 text-xs text-muted">
              {[
                counts.rewritten && `${counts.rewritten} rewritten`,
                counts.added && `${counts.added} added`,
                counts.removed && `${counts.removed} removed`,
                counts.renamed && `${counts.renamed} renamed`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />
          Only show changes
        </label>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span><Del>removed</Del></span>
        <span><Add>added</Add></span>
        <span>Unchanged text is shown in grey.</span>
      </p>

      {(diff.summary.changed || !onlyChanges) && (
        <Block title="SUMMARY">
          <Diffed before={diff.summary.before} after={diff.summary.after} kind={diff.summary.changed ? "changed" : "same"} />
        </Block>
      )}

      {diff.sections.filter((s) => show(s.kind)).map((s) => (
        <Block
          key={s.id}
          title={
            s.kind === "added" ? <Add>{s.titleAfter.toUpperCase()}</Add>
            : s.kind === "removed" ? <Del>{s.titleBefore.toUpperCase()}</Del>
            : s.titleBefore !== s.titleAfter ? <><Del>{s.titleBefore.toUpperCase()}</Del> <Add>{s.titleAfter.toUpperCase()}</Add></>
            : s.titleAfter.toUpperCase()
          }
          note={s.hidden ? "hidden from export" : s.kind === "added" ? "new section" : s.kind === "removed" ? "section removed" : undefined}
        >
          {s.items.filter((it) => show(it.kind)).map((it) => (
            <Entry key={it.id} item={it} onlyChanges={onlyChanges} />
          ))}
        </Block>
      ))}
    </div>
  );
}

function Entry({ item, onlyChanges }: { item: ItemDiff; onlyChanges: boolean }) {
  const title = (h: ItemDiff["after"]) => [h?.heading, h?.subheading].filter(Boolean).join(", ");
  const meta = (h: ItemDiff["after"]) => [h?.location, h?.dates].filter(Boolean).join(" | ");
  const headerChanged = item.before && item.after && (title(item.before) !== title(item.after) || meta(item.before) !== meta(item.after));
  const bullets = item.bullets.filter((b) => !onlyChanges || b.kind !== "same");

  return (
    <div className="mt-2">
      <div className={`flex flex-wrap items-baseline justify-between gap-x-4 ${item.kind === "same" ? "text-neutral-400" : ""}`}>
        <span className="font-semibold">
          {item.kind === "added" ? <Add>{title(item.after)}</Add>
          : item.kind === "removed" ? <Del>{title(item.before)}</Del>
          : headerChanged ? <Diffed before={title(item.before)} after={title(item.after)} kind="changed" />
          : title(item.after)}
        </span>
        <span className="text-[13px] text-neutral-500">{meta(item.after ?? item.before)}</span>
      </div>
      {bullets.length > 0 && (
        <ul className="mt-0.5 space-y-0.5">
          {bullets.map((b) => (
            <BulletRow key={b.id} b={b} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BulletRow({ b }: { b: BulletDiff }) {
  const tag = { added: "Added", removed: "Removed", changed: "Rewritten", same: "" }[b.kind];
  return (
    <li className="flex items-start gap-2">
      <span className="select-none pt-px" aria-hidden>•</span>
      <span className="flex-1">
        <Diffed before={b.before} after={b.after} kind={b.kind} />
      </span>
      {tag && <span className="shrink-0 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">{tag}</span>}
    </li>
  );
}

/** Text with word-level highlights for a changed line, or a whole-line style for added/removed/unchanged. */
function Diffed({ before, after, kind }: { before: string; after: string; kind: Kind }) {
  if (kind === "same") return <span className="text-neutral-400">{after}</span>;
  if (kind === "added") return <Add>{after}</Add>;
  if (kind === "removed") return <Del>{before}</Del>;
  return (
    <>
      {wordDiff(before, after).map((t, i) =>
        t.type === "same" ? <span key={i}>{t.text}</span> : t.type === "add" ? <Add key={i}>{t.text}</Add> : <Del key={i}>{t.text}</Del>,
      )}
    </>
  );
}

function Block({ title, note, children }: { title: React.ReactNode; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="flex items-baseline gap-2 border-b border-neutral-300 pb-0.5 text-[13px] font-bold tracking-wide">
        {title}
        {note && <span className="text-xs font-normal normal-case tracking-normal text-neutral-400">({note})</span>}
      </h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

const Add = ({ children }: { children: React.ReactNode }) => <ins className="rounded-sm bg-green-100 px-0.5 text-green-900 no-underline">{children}</ins>;
const Del = ({ children }: { children: React.ReactNode }) => <del className="rounded-sm bg-red-50 px-0.5 text-red-700 decoration-red-400">{children}</del>;
