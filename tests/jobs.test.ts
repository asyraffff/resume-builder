import { beforeEach, describe, expect, it } from "vitest";
import { migrateV1, migrateV2, selectJobs, selectWorkspaces, useResumeStore } from "@/store/resume-store";
import type { JobDescription, MatchReport } from "@/lib/schemas";
import { sampleResume, sug } from "./fixtures";

const jd = (title: string, company = "Acme"): JobDescription => ({
  title,
  company,
  seniority: "",
  requiredSkills: [],
  niceToHaveSkills: [],
  responsibilities: [],
  keywords: [],
  summary: "",
});

const report = (score: number): MatchReport => ({
  score,
  breakdown: { keywordCoverage: 0, experienceRelevance: 0, seniorityFit: 0 },
  summary: "",
  matchedKeywords: [],
  missingKeywords: [],
  suggestions: [sug({ id: "s1", target: "summary", proposed: `summary ${score}` })],
  suggestedSectionOrder: [],
});

const store = () => useResumeStore.getState();
const ats = { score: 80, summary: "", issues: [], strengths: [] };

beforeEach(() => {
  store().startOver();
  store().setParsed(sampleResume(), ats, "cv.pdf");
});

describe("jobs", () => {
  it("keeps a separate tailored resume, report and suggestion status per job", () => {
    const fe = store().addJob(jd("Frontend"), "original");
    store().setReportFor(fe, report(60));
    store().acceptSuggestion("s1");

    const be = store().addJob(jd("Backend"), "original");
    expect(store().resume?.summary).toBe("Engineer."); // starts from the upload, not the frontend edits
    store().setReportFor(be, report(30));
    store().updateResume((r) => ({ ...r, summary: "backend summary" }));

    store().switchJob(fe);
    expect(store().resume?.summary).toBe("summary 60");
    expect(store().jd?.title).toBe("Frontend");
    expect(store().report?.score).toBe(60);
    expect(store().suggestionStatus).toEqual({ s1: "accepted" });

    store().switchJob(be);
    expect(store().resume?.summary).toBe("backend summary");
    expect(store().report?.score).toBe(30);
  });

  it("can start a new job from a copy of the resume on screen", () => {
    store().addJob(jd("Frontend"), "original");
    store().updateResume((r) => ({ ...r, summary: "tailored" }));
    store().addJob(jd("Fullstack"), "current");
    expect(store().resume?.summary).toBe("tailored");
  });

  it("stores a report for a job that is not on screen", () => {
    const a = store().addJob(jd("A"), "original");
    const b = store().addJob(jd("B"), "original");
    store().setReportFor(a, report(70));
    expect(store().report).toBeNull(); // B is on screen
    expect(selectJobs(store()).find((j) => j.id === a)?.report?.score).toBe(70);
    expect(selectJobs(store()).find((j) => j.id === b)?.report).toBeNull();
  });

  it("selectJobs reflects unsaved edits of the job on screen", () => {
    const a = store().addJob(jd("A"), "original");
    store().updateResume((r) => ({ ...r, summary: "live" }));
    expect(selectJobs(store()).find((j) => j.id === a)?.resume.summary).toBe("live");
  });

  it("deleting the job on screen switches to another job, or back to the uploaded resume", () => {
    const a = store().addJob(jd("A"), "original");
    const b = store().addJob(jd("B"), "original");
    store().deleteJob(b);
    expect(store().activeJobId).toBe(a);
    store().deleteJob(a);
    expect(store().activeJobId).toBeNull();
    expect(store().jd).toBeNull();
    expect(store().resume?.summary).toBe("Engineer.");
  });

  it("clears undo history when switching jobs", () => {
    const a = store().addJob(jd("A"), "original");
    store().addJob(jd("B"), "original");
    store().updateResume((r) => ({ ...r, summary: "b edit" }));
    store().switchJob(a);
    expect(store().past).toHaveLength(0);
  });

  it("renames, falling back to the default label when empty", () => {
    const a = store().addJob(jd("Data Engineer", "Zurich"), "original");
    store().renameJob(a, "  Zurich DE  ");
    expect(store().jobs[0].label).toBe("Zurich DE");
    store().renameJob(a, " ");
    expect(store().jobs[0].label).toBe("Zurich – Data Engineer");
  });

});

describe("saved resumes", () => {
  it("each upload is its own resume with its own jobs", () => {
    const first = store().activeWorkspaceId!;
    store().addJob(jd("A"), "original");
    store().updateResume((r) => ({ ...r, summary: "tailored for A" }));

    store().setParsed({ ...sampleResume(), summary: "second cv" }, ats, "cv2.pdf");
    const second = store().activeWorkspaceId!;
    expect(second).not.toBe(first);
    expect(store().jobs).toHaveLength(0);
    expect(store().resume?.summary).toBe("second cv");
    expect(store().fileName).toBe("cv2.pdf");

    store().switchWorkspace(first);
    expect(store().fileName).toBe("cv.pdf");
    expect(store().jobs.map((j) => j.label)).toEqual(["Acme – A"]);
    expect(store().resume?.summary).toBe("tailored for A");
    expect(store().past).toHaveLength(0); // undo history doesn't cross resumes
  });

  it("selectWorkspaces reflects unsaved edits of the open resume", () => {
    store().updateResume((r) => ({ ...r, summary: "live" }));
    const ws = selectWorkspaces(store());
    expect(ws).toHaveLength(1);
    expect(ws[0].resume.summary).toBe("live");
  });

  it("deleting the open resume opens the most recent other one, or nothing", () => {
    const first = store().activeWorkspaceId!;
    store().setParsed(sampleResume(), ats, "cv2.pdf");
    const second = store().activeWorkspaceId!;
    store().deleteWorkspace(second);
    expect(store().activeWorkspaceId).toBe(first);
    expect(store().fileName).toBe("cv.pdf");
    store().deleteWorkspace(first);
    expect(store().activeWorkspaceId).toBeNull();
    expect(store().resume).toBeNull();
    expect(store().workspaces).toHaveLength(0);
  });

  it("deleting another resume leaves the open one alone", () => {
    const first = store().activeWorkspaceId!;
    store().setParsed(sampleResume(), ats, "cv2.pdf");
    const second = store().activeWorkspaceId!;
    store().deleteWorkspace(first);
    expect(store().activeWorkspaceId).toBe(second);
    expect(selectWorkspaces(store()).map((w) => w.fileName)).toEqual(["cv2.pdf"]);
  });
});

describe("accept all safe", () => {
  it("skips suggestions that still contain placeholders", () => {
    const a = store().addJob(jd("Frontend"), "original");
    store().setReportFor(a, {
      ...report(50),
      suggestions: [
        sug({ id: "ok", target: "summary", proposed: "Clean summary" }),
        sug({ id: "ph", sectionId: "exp", itemId: "job1", bulletId: "b1", proposed: "Cut runtime by [% reduction in runtime]" }),
      ],
    });
    expect(store().acceptAllSafe()).toBe(1);
    expect(store().suggestionStatus).toEqual({ ok: "accepted" });
    expect(store().resume?.sections[0].items[0].bullets[0].text).toBe("Built things");
  });
});

describe("migrating saved data from the previous version", () => {
  const base = {
    resume: sampleResume(),
    original: sampleResume(),
    ats,
    fileName: "cv.pdf",
    suggestionStatus: {},
  };

  it("turns the job on screen into the active job", () => {
    const m = migrateV1({ ...base, jd: jd("Data Engineer", "Zurich"), report: report(55), versions: [] });
    expect(m.jobs).toHaveLength(1);
    expect(m.activeJobId).toBe(m.jobs![0].id);
    expect(m.jobs![0].report?.score).toBe(55);
    expect(m.jobs![0].label).toBe("Zurich – Data Engineer");
  });

  it("turns saved versions into jobs, skipping exact duplicates of the one on screen", () => {
    const zurich = jd("Data Engineer", "Zurich");
    const edited = { ...sampleResume(), summary: "older draft" };
    const m = migrateV1({
      ...base,
      jd: zurich,
      report: report(55),
      versions: [
        { id: "dup", name: "Zurich", savedAt: 1, resume: sampleResume(), jd: zurich },
        { id: "old", name: "Zurich v1", savedAt: 2, resume: edited, jd: zurich },
        { id: "other", name: "Acme", savedAt: 3, resume: sampleResume(), jd: jd("Frontend"), report: report(40) },
        { id: "nojob", name: "General", savedAt: 4, resume: sampleResume(), jd: null },
      ],
    });
    expect(m.jobs!.map((j) => j.resume.summary)).toEqual(["Engineer.", "older draft", "Engineer."]);
    expect(m.jobs![1].report?.score).toBe(55); // same job, no report saved: reuse the current one
    expect(m.jobs![2].report?.score).toBe(40);
  });

  it("keeps a general draft with no jobs when nothing was matched", () => {
    const m = migrateV1({ ...base, jd: null, report: null });
    expect(m.jobs).toEqual([]);
    expect(m.activeJobId).toBeNull();
    expect(m.resume?.summary).toBe("Engineer.");
  });
});

describe("migrating from a single resume", () => {
  it("turns the existing resume and its jobs into the first saved resume", () => {
    const m = migrateV2({
      resume: sampleResume(),
      original: sampleResume(),
      ats,
      fileName: "cv.pdf",
      jd: null,
      report: null,
      suggestionStatus: {},
      jobs: [],
      activeJobId: null,
    });
    expect(m.workspaces).toHaveLength(1);
    expect(m.activeWorkspaceId).toBe(m.workspaces![0].id);
    expect(m.workspaces![0].fileName).toBe("cv.pdf");
  });

  it("starts empty when nothing was uploaded", () => {
    expect(migrateV2({ resume: null, original: null })).toMatchObject({ workspaces: [], activeWorkspaceId: null });
  });
});

describe("last edited", () => {
  it("only changes on real edits, not when switching resumes", async () => {
    const first = store().activeWorkspaceId!;
    store().setParsed(sampleResume(), ats, "cv2.pdf");
    const before = selectWorkspaces(store()).find((w) => w.id === first)!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    store().switchWorkspace(first);
    expect(selectWorkspaces(store()).find((w) => w.id === first)!.updatedAt).toBe(before);
    store().updateResume((r) => ({ ...r, summary: "edit" }));
    expect(selectWorkspaces(store()).find((w) => w.id === first)!.updatedAt).toBeGreaterThan(before);
  });
});
