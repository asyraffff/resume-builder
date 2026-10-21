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
