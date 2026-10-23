import { describe, expect, it } from "vitest";
import { JobDescription, MatchReport, Resume } from "@/lib/schemas";
import { sampleAts, sampleJob, sampleReport, sampleResume } from "@/lib/sample";
import { applySuggestion, isStale } from "@/lib/apply-suggestion";
import { runAtsChecks } from "@/lib/ats-checks";

describe("the sample resume", () => {
  it("is valid data", () => {
    expect(() => Resume.parse(sampleResume)).not.toThrow();
    expect(() => JobDescription.parse(sampleJob)).not.toThrow();
    expect(() => MatchReport.parse(sampleReport)).not.toThrow();
  });

  it("has suggestions that all apply cleanly and none start out stale", () => {
    for (const s of sampleReport.suggestions) {
      expect(isStale(sampleResume, s), s.id).toBe(false);
      expect(applySuggestion(sampleResume, s), s.id).not.toBeNull();
    }
    expect(sampleReport.suggestedSectionOrder.sort()).toEqual(sampleResume.sections.map((s) => s.id).sort());
  });

  it("has an ATS report consistent with what the live check finds", () => {
    const live = runAtsChecks(sampleResume, { fileType: "pdf" }).map((i) => i.title);
    expect(live).toContain("Non-standard section headings");
    expect(sampleAts.issues.map((i) => i.title)).toContain("Non-standard section headings");
  });
});
