import { describe, expect, it } from "vitest";
import { compareResumes, wordDiff } from "@/lib/diff";
import { sampleResume } from "./fixtures";

describe("wordDiff", () => {
  it("marks removed and added words, keeping shared words", () => {
    expect(wordDiff("Built things fast", "Built React apps fast")).toEqual([
      { type: "same", text: "Built " },
      { type: "del", text: "things " },
      { type: "add", text: "React apps " },
      { type: "same", text: "fast" },
    ]);
  });

  it("returns only same tokens for identical text", () => {
    expect(wordDiff("a b", "a b")).toEqual([{ type: "same", text: "a b" }]);
  });
});

describe("compareResumes", () => {
  it("reports nothing for identical resumes", () => {
    const d = compareResumes(sampleResume(), sampleResume());
    expect(d.total).toBe(0);
    expect(d.sections.every((s) => s.kind === "same")).toBe(true);
  });

  it("finds rewritten, added and removed bullets, renamed sections and summary changes", () => {
    const before = sampleResume();
    const after = sampleResume();
    after.summary = "Senior engineer.";
    after.sections[0].title = "Work Experience";
    after.sections[0].items[0].bullets[0].text = "Built React apps";
    after.sections[0].items[0].bullets = after.sections[0].items[0].bullets.filter((b) => b.id !== "b2");
    after.sections[0].items[0].bullets.push({ id: "new", text: "Mentored two interns" });
    after.sections[0].items[0].bullets.push({ id: "blank", text: "  " });

    const d = compareResumes(before, after);
    expect(d.summary.changed).toBe(true);
    expect(d.counts).toEqual({ rewritten: 2, added: 1, removed: 1, renamed: 1 });
    expect(d.total).toBe(5);
    const bullets = d.sections[0].items[0].bullets.map((b) => `${b.kind}:${b.id}`);
    expect(bullets).toEqual(["changed:b1", "added:new", "removed:b2"]);
  });

  it("counts a whole added or removed section once", () => {
    const before = sampleResume();
    const after = sampleResume();
    after.sections = after.sections.filter((s) => s.id !== "skills");
    after.sections.push({ id: "proj", type: "projects", title: "Projects", hidden: false, items: [{ id: "p1", heading: "App", subheading: "", dates: "", location: "", bullets: [{ id: "pb", text: "Shipped it" }] }] });
    const d = compareResumes(before, after);
    expect(d.counts).toEqual({ rewritten: 0, added: 1, removed: 1, renamed: 0 });
    expect(d.sections.find((s) => s.id === "skills")?.kind).toBe("removed");
  });

  it("ignores whitespace-only edits", () => {
    const after = sampleResume();
    after.sections[0].items[0].bullets[0].text = "  Built things ";
    expect(compareResumes(sampleResume(), after).total).toBe(0);
  });
});
