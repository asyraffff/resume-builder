import { describe, expect, it } from "vitest";
import { applySuggestion, reorderSections } from "@/lib/apply-suggestion";
import { sampleResume, sug } from "./fixtures";

describe("applySuggestion", () => {
  it("rewrites the summary", () => {
    const r = applySuggestion(sampleResume(), sug({ target: "summary", proposed: "Senior engineer." }));
    expect(r?.summary).toBe("Senior engineer.");
  });

  it("rewrites a bullet without touching others", () => {
    const r = applySuggestion(sampleResume(), sug({ sectionId: "exp", itemId: "job1", bulletId: "b1", proposed: "Built a React app used by 10k users" }))!;
    const bullets = r.sections[0].items[0].bullets;
    expect(bullets.map((b) => b.text)).toEqual(["Built a React app used by 10k users", "Fixed bugs"]);
    expect(bullets[0].id).toBe("b1");
  });

  it("uses the user's edited text when given", () => {
    const r = applySuggestion(sampleResume(), sug({ sectionId: "exp", itemId: "job1", bulletId: "b1", proposed: "AI text" }), "  My text  ")!;
    expect(r.sections[0].items[0].bullets[0].text).toBe("My text");
  });

  it("adds and removes bullets", () => {
    const added = applySuggestion(sampleResume(), sug({ kind: "add", sectionId: "exp", itemId: "job1", proposed: "New" }))!;
    expect(added.sections[0].items[0].bullets).toHaveLength(3);
    const removed = applySuggestion(sampleResume(), sug({ kind: "remove", sectionId: "exp", itemId: "job1", bulletId: "b2" }))!;
    expect(removed.sections[0].items[0].bullets.map((b) => b.id)).toEqual(["b1"]);
  });

  it("adds a skill to the named group, or the first group as fallback", () => {
    const a = applySuggestion(sampleResume(), sug({ kind: "add", target: "skills", sectionId: "skills", itemId: "sk1", proposed: "Go" }))!;
    expect(a.sections[1].items[0].bullets.map((b) => b.text)).toEqual(["TypeScript", "Go"]);
    const b = applySuggestion(sampleResume(), sug({ kind: "add", target: "skills", sectionId: "skills", itemId: "", proposed: "Rust" }))!;
    expect(b.sections[1].items[0].bullets.at(-1)?.text).toBe("Rust");
  });

  it("renames a section", () => {
    const r = applySuggestion(sampleResume(), sug({ target: "section", sectionId: "exp", proposed: "Work Experience" }))!;
    expect(r.sections[0].title).toBe("Work Experience");
  });

  it("returns null when the target no longer exists", () => {
    expect(applySuggestion(sampleResume(), sug({ sectionId: "nope", itemId: "job1", bulletId: "b1" }))).toBeNull();
    expect(applySuggestion(sampleResume(), sug({ sectionId: "exp", itemId: "job1", bulletId: "gone" }))).toBeNull();
  });

  it("does not mutate the input", () => {
    const r = sampleResume();
    const before = JSON.stringify(r);
    applySuggestion(r, sug({ sectionId: "exp", itemId: "job1", bulletId: "b1", proposed: "changed" }));
    expect(JSON.stringify(r)).toBe(before);
  });
});

describe("reorderSections", () => {
  it("reorders and keeps unlisted sections at the end", () => {
    const r = reorderSections(sampleResume(), ["skills"]);
    expect(r.sections.map((s) => s.id)).toEqual(["skills", "exp"]);
  });
});
