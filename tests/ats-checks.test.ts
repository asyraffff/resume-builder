import { describe, expect, it } from "vitest";
import { dateStyle, mergeAts, runAtsChecks } from "@/lib/ats-checks";
import { sampleResume } from "./fixtures";

describe("runAtsChecks", () => {
  it("gives every rule issue a topic and strips it after merging", () => {
    const r = sampleResume();
    r.contact.phone = "";
    const rules = runAtsChecks(r, { fileType: "pdf" });
    expect(rules.every((i) => i.topic instanceof RegExp)).toBe(true);
    expect(mergeAts(90, [], rules).issues.every((i) => !("topic" in i))).toBe(true);
  });

  it("passes a clean resume", () => {
    expect(runAtsChecks(sampleResume(), { fileType: "pdf" })).toEqual([]);
  });

  it("flags missing contact info and non-standard headings", () => {
    const r = sampleResume();
    r.contact.email = "";
    r.sections[0].title = "My Journey";
    const titles = runAtsChecks(r, { fileType: "pdf" }).map((i) => i.title);
    expect(titles).toContain("No email address found");
    expect(titles).toContain("Non-standard section headings");
  });

  it.each([
    "Professional Experience",
    "Education and Certifications",
    "Education & Certifications",
    "Core Competencies",
    "Skills / Tools",
    "Licenses, Certifications and Training",
    "WORK HISTORY:",
    "Relevant Projects",
    "Honors and Awards",
  ])("accepts the common heading %j", (title) => {
    const r = sampleResume();
    r.sections[0].title = title;
    expect(runAtsChecks(r, { fileType: "pdf" }).map((i) => i.title)).not.toContain("Non-standard section headings");
  });

  it.each(["My Journey", "Stuff I Did", "Experience and Hobbies Corner", "Where I've Been"])("still flags the creative heading %j", (title) => {
    const r = sampleResume();
    r.sections[0].title = title;
    expect(runAtsChecks(r, { fileType: "pdf" }).map((i) => i.title)).toContain("Non-standard section headings");
  });

  it("points out two sections with the same heading", () => {
    const r = sampleResume();
    r.sections[1].title = "Experience";
    const issue = runAtsChecks(r, { fileType: "pdf" }).find((i) => i.title === "Two sections share a heading");
    expect(issue?.severity).toBe("low");
    expect(issue?.detail).toContain('"Experience"');
  });

  it("flags an unreadable (empty) resume", () => {
    const r = sampleResume();
    r.sections = [];
    expect(runAtsChecks(r, { fileType: "pdf" })[0].severity).toBe("high");
  });

  it("flags mixed date formats", () => {
    const r = sampleResume();
    r.sections[0].items.push({ ...r.sections[0].items[0], id: "job2", dates: "03/2018 - 12/2020" });
    expect(runAtsChecks(r, { fileType: "pdf" }).map((i) => i.title)).toContain("Inconsistent date formats");
  });
});

describe("dateStyle", () => {
  it("classifies formats", () => {
    expect(dateStyle("Jan 2021 – Present")).toBe("month-year");
    expect(dateStyle("03/2018")).toBe("numeric");
    expect(dateStyle("2019 - 2021")).toBe("year");
    expect(dateStyle("")).toBe("empty");
  });
});

describe("mergeAts", () => {
  it("adds rule issues the AI missed, penalises the score, and sorts by severity", () => {
    const out = mergeAts(
      80,
      [{ severity: "low", title: "Weak verbs", detail: "", fix: "" }],
      [{ severity: "high", title: "No email address found", detail: "", fix: "", topic: /e-?mail/i }],
    );
    expect(out.score).toBe(65);
    expect(out.issues.map((i) => i.severity)).toEqual(["high", "low"]);
  });

  it("does not double count an issue the AI already reported", () => {
    const out = mergeAts(
      80,
      [{ severity: "high", title: "Missing phone number", detail: "", fix: "" }],
      [{ severity: "medium", title: "No phone number found", detail: "", fix: "", topic: /phone/i }],
    );
    expect(out.issues).toHaveLength(1);
    expect(out.score).toBe(80);
  });
});

describe("live checks on an edited resume", () => {
  it("flags unfilled placeholders, a missing summary and empty bullets", () => {
    const r = sampleResume();
    r.summary = "";
    r.sections[0].items[0].bullets[0].text = "Cut runtime by [% reduction in runtime]";
    r.sections[0].items[0].bullets.push({ id: "e", text: "  " });
    const titles = runAtsChecks(r).map((i) => i.title);
    expect(titles).toContain("1 unfilled placeholder");
    expect(titles).toContain("No professional summary");
    expect(titles).toContain("1 empty bullet");
  });

  it("warns when the resume is probably over two pages", () => {
    const r = sampleResume();
    r.sections[0].items[0].bullets = Array.from({ length: 40 }, (_, i) => ({ id: `b${i}`, text: "word ".repeat(25) }));
    expect(runAtsChecks(r).find((i) => i.title.startsWith("Probably longer"))?.severity).toBe("medium");
  });

  it("works without upload context", () => {
    expect(runAtsChecks(sampleResume())).toEqual([]);
  });
});
