import { describe, expect, it } from "vitest";
import { keywordCoverage, liveScore, norm } from "@/lib/keywords";
import type { JobDescription, MatchReport } from "@/lib/schemas";
import { sampleResume } from "./fixtures";

const withText = (text: string) => {
  const r = sampleResume();
  r.summary = text;
  return r;
};

describe("keyword coverage", () => {
  it("normalises punctuation and case", () => {
    expect(norm("CI/CD")).toBe(norm("ci-cd"));
    expect(norm("Node.js")).toBe(" node.js ");
    expect(norm("C++")).toBe(" c plus plus ");
  });

  it("matches whole words only", () => {
    const r = withText("Built Java services");
    expect(keywordCoverage(r, ["Java", "JavaScript"]).matched).toEqual(["Java"]);
  });

  it("accepts aliases, plurals and parenthetical parts", () => {
    const r = withText("Tuned Postgres queries, built REST APIs, improved accessibility and ran pipelines on AWS");
    const c = keywordCoverage(r, ["PostgreSQL", "REST", "Accessibility (WCAG 2.1 AA)", "pipeline", "Amazon Web Services"]);
    expect(c.missing).toEqual([]);
    expect(c.percent).toBe(100);
  });

  it("ignores hidden sections and contact details", () => {
    const r = sampleResume();
    r.contact.email = "kafka@example.com";
    r.sections[1].hidden = true; // skills section with TypeScript
    expect(keywordCoverage(r, ["Kafka", "TypeScript"]).matched).toEqual([]);
  });

  it("is deterministic and de-duplicates keywords", () => {
    const r = withText("TypeScript and React");
    const a = keywordCoverage(r, ["React", "react", "TypeScript", "Go"]);
    const b = keywordCoverage(r, ["React", "react", "TypeScript", "Go"]);
    expect(a).toEqual(b);
    expect(a.matched).toEqual(["React", "TypeScript"]);
    expect(a.percent).toBe(67);
  });
});

describe("live score", () => {
  const jd = { keywords: ["React", "TypeScript", "Go", "Kafka"] } as JobDescription;
  const report = { score: 10, breakdown: { keywordCoverage: 0, experienceRelevance: 80, seniorityFit: 60 } } as MatchReport;

  it("combines live keyword coverage with the AI's experience and seniority", () => {
    const s = liveScore(report, withText("React and TypeScript"), jd);
    expect(s.keywords).toBe(50);
    expect(s.score).toBe(Math.round(50 * 0.35 + 80 * 0.4 + 60 * 0.25)); // 65
  });

  it("rises when the resume gains keywords, without re-running the AI", () => {
    const before = liveScore(report, withText("React"), jd).score;
    const after = liveScore(report, withText("React, TypeScript, Go and Kafka"), jd).score;
    expect(after).toBeGreaterThan(before);
  });
});
