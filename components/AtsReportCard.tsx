"use client";

import { Badge, Card, ScoreRing } from "./ui";
import type { AtsReport } from "@/lib/schemas";

export function AtsReportCard({ ats }: { ats: AtsReport }) {
  return (
    <Card>
      <div className="flex items-start gap-5">
        <ScoreRing score={ats.score} label="ATS score" />
        <div className="min-w-0">
          <h2 className="font-semibold">ATS check</h2>
          <p className="mt-1 text-sm text-muted">{ats.summary}</p>
        </div>
      </div>

      {ats.issues.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium">Issues to fix</h3>
          <ul className="mt-2 space-y-3">
            {ats.issues.map((i, idx) => (
              <li key={idx} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Badge tone={i.severity === "high" ? "bad" : i.severity === "medium" ? "warn" : "neutral"}>{i.severity}</Badge>
                  <span className="text-sm font-medium">{i.title}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{i.detail}</p>
                <p className="mt-1 text-sm"><span className="font-medium">Fix: </span>{i.fix}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ats.strengths.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium">What&apos;s working</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {ats.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      <p className="mt-5 rounded-lg bg-accent-soft p-3 text-sm text-accent">
        Formatting issues are fixed automatically on export: you&apos;ll get a clean, single-column, ATS-safe layout in PDF or Word.
      </p>
    </Card>
  );
}
