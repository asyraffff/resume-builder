import { describe, expect, it } from "vitest";
import { fillPlaceholder, findPlaceholders, hasPlaceholders, placeholdersInResume } from "@/lib/placeholders";
import { sampleResume } from "./fixtures";

describe("placeholders", () => {
  it("finds unique placeholders", () => {
    const t = "Cut runtime by [% reduction in runtime] across [number of pipelines] pipelines; [% reduction in runtime] again";
    expect(findPlaceholders(t)).toEqual(["[% reduction in runtime]", "[number of pipelines]"]);
    expect(hasPlaceholders("No numbers here")).toBe(false);
  });

  it("fills every occurrence and trims the value", () => {
    expect(fillPlaceholder("A [x] and [x]", "[x]", " ~20% ")).toBe("A ~20% and ~20%");
  });

  it("lists placeholders left in visible parts of the resume", () => {
    const r = sampleResume();
    r.summary = "Engineer with [years of experience] years.";
    r.sections[0].items[0].bullets[0].text = "Built [number of services] services";
    r.sections[1].hidden = true;
    r.sections[1].items[0].bullets[0].text = "[hidden]";
    expect(placeholdersInResume(r)).toEqual([
      { where: "Summary", placeholder: "[years of experience]" },
      { where: "Experience › Software Engineer", placeholder: "[number of services]" },
    ]);
  });
});
