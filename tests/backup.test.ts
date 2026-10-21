import { beforeEach, describe, expect, it } from "vitest";
import { BACKUP_FORMAT, createBackup, describeImport, parseBackup } from "@/lib/backup";
import { selectWorkspaces, useResumeStore } from "@/store/resume-store";
import type { JobDescription, MatchReport } from "@/lib/schemas";
import { sampleResume, sug } from "./fixtures";

const store = () => useResumeStore.getState();
const ats = { score: 70, summary: "", issues: [], strengths: [] };
const jd: JobDescription = {
  title: "Data Engineer",
  company: "Zurich",
  seniority: "",
  requiredSkills: [],
  niceToHaveSkills: [],
  responsibilities: [],
  keywords: [],
  summary: "",
};
const report: MatchReport = {
  score: 72,
  breakdown: { keywordCoverage: 1, experienceRelevance: 2, seniorityFit: 3 },
  summary: "",
  matchedKeywords: [],
  missingKeywords: [],
  suggestions: [sug({ id: "s1", target: "summary", proposed: "x" })],
  suggestedSectionOrder: [],
};

beforeEach(() => {
  store().startOver();
  store().setParsed(sampleResume(), ats, "cv.pdf");
  const job = store().addJob(jd, "original");
  store().setReportFor(job, report);
  store().acceptSuggestion("s1");
});

const backupText = () => JSON.stringify(createBackup(selectWorkspaces(store())));

describe("backup", () => {
  it("round-trips every resume, job, report and accepted suggestion", () => {
    const text = backupText();
    store().startOver();
    expect(store().workspaces).toHaveLength(0);

    store().importWorkspaces(parseBackup(text));
    expect(store().fileName).toBe("cv.pdf");
    expect(store().jobs).toHaveLength(1);
    expect(store().report?.score).toBe(72);
    expect(store().suggestionStatus).toEqual({ s1: "accepted" });
    expect(store().resume?.summary).toBe("x");
  });

  it("restoring adds new resumes and replaces existing copies by id", () => {
    const text = backupText();
    store().updateResume((r) => ({ ...r, summary: "edited after backup" }));
    store().setParsed(sampleResume(), ats, "other.pdf");

    const incoming = parseBackup(text);
    expect(describeImport(selectWorkspaces(store()), incoming)).toEqual({ added: 0, replaced: 1, total: 1 });
    store().importWorkspaces(incoming);

    const ws = selectWorkspaces(store());
    expect(ws.map((w) => w.fileName).sort()).toEqual(["cv.pdf", "other.pdf"]);
    expect(ws.find((w) => w.fileName === "cv.pdf")!.resume.summary).toBe("x"); // backup copy won
    expect(store().fileName).toBe("other.pdf"); // the open resume wasn't replaced, so it stays open
  });

  it("reopens the backup copy when it replaces the resume on screen", () => {
    const text = backupText();
    store().updateResume((r) => ({ ...r, summary: "edited after backup" }));
    store().importWorkspaces(parseBackup(text));
    expect(store().resume?.summary).toBe("x");
  });

  it("accepts reports saved before metric hints existed", () => {
    const file = createBackup(selectWorkspaces(store()));
    const legacy = JSON.parse(JSON.stringify(file));
    delete legacy.workspaces[0].jobs[0].report.suggestions[0].metricHints;
    const [w] = parseBackup(JSON.stringify(legacy));
    expect(w.jobs[0].report!.suggestions[0].metricHints).toEqual([]);
  });

  it.each([
    ["not JSON", "{oops", /not JSON/],
    ["another app's file", JSON.stringify({ app: "something-else" }), /isn't a Resume Tailor backup/],
    ["a newer format", JSON.stringify({ app: "resume-tailor", format: BACKUP_FORMAT + 1 }), /newer version/],
    ["a damaged backup", JSON.stringify({ app: "resume-tailor", format: 1, exportedAt: "", workspaces: [{ id: "x" }] }), /damaged/],
  ])("rejects %s with a clear message", (_name, text, message) => {
    expect(() => parseBackup(text)).toThrow(message);
  });
});
