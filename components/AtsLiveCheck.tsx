"use client";

import { useMemo } from "react";
import { runAtsChecks } from "@/lib/ats-checks";
import type { Resume } from "@/lib/schemas";
import { Badge } from "./ui";

/** ATS checks re-run instantly on the version on screen, so the result always reflects the latest edits. */
export function AtsLiveCheck({ resume }: { resume: Resume }) {
  const issues = useMemo(() => runAtsChecks(resume), [resume]);
  const serious = issues.filter((i) => i.severity !== "low").length;

  return (
    <details className="group rounded-lg border border-border" open={serious > 0}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="font-medium">ATS check · this version</span>
        {issues.length === 0 ? (
          <Badge tone="good">✓ No problems</Badge>
        ) : (
          <Badge tone={serious ? "bad" : "warn"}>
            {issues.length} to fix
          </Badge>
        )}
      </summary>
      <div className="border-t border-border px-3 py-2 text-xs">
        {issues.length === 0 ? (
          <p className="text-muted">Checked just now. The export uses a single-column, ATS-safe layout, so formatting is handled for you.</p>
        ) : (
          <ul className="space-y-2">
            {issues.map((i) => (
              <li key={i.title}>
                <p className="flex items-center gap-1.5">
                  <Badge tone={i.severity === "high" ? "bad" : i.severity === "medium" ? "warn" : "neutral"}>{i.severity}</Badge>
                  <span className="font-medium text-foreground">{i.title}</span>
                </p>
                <p className="mt-0.5 text-muted">{i.fix}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-muted">Updates as you edit.</p>
      </div>
    </details>
  );
}
