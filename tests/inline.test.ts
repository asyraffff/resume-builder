import { describe, expect, it } from "vitest";
import { contactHref, inlineToHtml, parseInline, plainText, rawOffset, safeHref, tidyUrl } from "@/lib/inline";
import { findPlaceholders } from "@/lib/placeholders";
import { keywordCoverage } from "@/lib/keywords";
import { compareResumes } from "@/lib/diff";
import { runAtsChecks } from "@/lib/ats-checks";
import { currentTextFor, isStale } from "@/lib/apply-suggestion";
import { sampleResume, sug } from "./fixtures";

describe("inline formatting", () => {
  it("parses bold, italic and links", () => {
    expect(parseInline("Led **migration** to *TypeScript* at [Acme](https://acme.com)")).toEqual([
      { text: "Led " },
      { text: "migration", bold: true },
      { text: " to " },
      { text: "TypeScript", italic: true },
      { text: " at " },
      { text: "Acme", href: "https://acme.com" },
    ]);
  });

  it("strips markers for plain text", () => {
    expect(plainText("Led **migration** to *TS* at [Acme](https://acme.com)")).toBe("Led migration to TS at Acme");
    expect(plainText("No formatting, 5 * 3 = 15")).toBe("No formatting, 5 * 3 = 15");
  });

  it("refuses unsafe link targets", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(parseInline("[click](javascript:alert(1))")[0].href).toBeUndefined();
  });

  it("escapes HTML when rendering", () => {
    expect(inlineToHtml("<b>x</b> **y**")).toBe("&lt;b&gt;x&lt;/b&gt; <strong>y</strong>");
    expect(inlineToHtml("[a](https://x.com/?q=\"y\")")).toContain('href="https://x.com/?q=&quot;y&quot;"');
  });

  it("doesn't mistake links for placeholders", () => {
    expect(findPlaceholders("See [Acme](https://acme.com) and [number of users]")).toEqual(["[number of users]"]);
  });
});

describe("contact links", () => {
  it.each([
    ["https://www.linkedin.com/in/jane-doe/?trk=public_profile", "linkedin.com/in/jane-doe"],
    ["http://my.linkedin.com/in/taylor-morgan-/", "linkedin.com/in/taylor-morgan-"],
    ["linkedin.com/in/jane", "linkedin.com/in/jane"],
    ["https://github.com/jane/", "github.com/jane"],
    ["jane@example.com", "jane@example.com"],
  ])("tidies %s", (raw, tidy) => {
    expect(tidyUrl(raw)).toBe(tidy);
  });

  it("makes clickable addresses", () => {
    expect(contactHref("jane@example.com")).toBe("mailto:jane@example.com");
    expect(contactHref("linkedin.com/in/jane")).toBe("https://linkedin.com/in/jane");
    expect(contactHref("Kuala Lumpur, Malaysia")).toBeNull();
    expect(contactHref("+60 12-345 6789")).toBeNull();
  });
});

describe("analysis ignores formatting", () => {
  const formatted = () => {
    const r = sampleResume();
    r.sections[0].items[0].bullets[0].text = "Built **Kafka** pipelines for [Acme](https://acme.com)";
    return r;
  };

  it("matches keywords inside bold text and link text", () => {
    expect(keywordCoverage(formatted(), ["Kafka", "Acme"]).missing).toEqual([]);
  });

  it("doesn't count formatting-only changes as edits", () => {
    const before = sampleResume();
    before.sections[0].items[0].bullets[0].text = "Built Kafka pipelines for Acme";
    expect(compareResumes(before, formatted()).total).toBe(0);
  });

  it("doesn't treat links as placeholders or AI instructions", () => {
    expect(runAtsChecks(formatted())).toEqual([]);
  });

  it("keeps suggestions fresh when only formatting changed", () => {
    const s = sug({ sectionId: "exp", itemId: "job1", bulletId: "b1", original: "Built Kafka pipelines for Acme" });
    expect(currentTextFor(formatted(), s)).toBe("Built Kafka pipelines for Acme");
    expect(isStale(formatted(), s)).toBe(false);
  });
});

describe("rawOffset", () => {
  const t = "Led **big** move to [Acme](https://a.co) now";
  it.each([
    [0, 0], // start
    [4, 6], // start of "big" inside **
    [7, 9], // end of "big"
    [8, 12], // after the bold text: "m" of "move"
    [16, 21], // start of link text "Acme"
    [17, 22], // "c" inside the link text
    [plainText(t).length, t.length],
  ])("maps plain offset %i to raw offset %i", (plain, raw) => {
    expect(rawOffset(t, plain)).toBe(raw);
  });

  it("points at the same character for every position inside plain runs and formatted text", () => {
    const plain = plainText(t);
    for (let i = 0; i < plain.length; i++) {
      const raw = rawOffset(t, i);
      // The character at the mapped position is the same one, except at a boundary where it lands on a marker.
      if (!"*[](".includes(t[raw])) expect(t[raw]).toBe(plain[i]);
    }
  });
});
