import { describe, expect, it } from "vitest";
import { applyEvent, expected, label, percent, remaining, remainingText, startProgress } from "@/lib/stream-progress";

const exp = { duration: 90_000, chars: 20_000 };

describe("stream progress", () => {
  it("eases through analysis without finishing, then follows the written output", () => {
    let p = startProgress(0);
    expect(percent(p, 500, exp)).toBeLessThanOrEqual(5);

    p = applyEvent(p, { type: "phase", phase: "analyzing" }, 1_000);
    const early = percent(p, 5_000, exp);
    const late = percent(p, 600_000, exp);
    expect(early).toBeGreaterThan(5);
    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThanOrEqual(45); // time alone never claims more than the analysis share

    p = applyEvent(p, { type: "progress", chars: 10_000, count: 4, stage: "suggestions" }, 60_000);
    expect(percent(p, 60_000, exp)).toBeCloseTo(45 + 26);
    p = applyEvent(p, { type: "progress", chars: 50_000, count: 20, stage: "suggestions" }, 70_000);
    expect(percent(p, 70_000, exp)).toBe(97); // never 100 until the result arrives
  });

  it("keeps the writing phase start time across progress events", () => {
    let p = applyEvent(startProgress(0), { type: "progress", chars: 100, count: 0, stage: "summary" }, 10_000);
    p = applyEvent(p, { type: "progress", chars: 4_000, count: 1, stage: "suggestions" }, 20_000);
    expect(p.phaseStartedAt).toBe(10_000);
    // 4000 chars in 10s = 0.4 chars/ms, 16000 left → 40s
    expect(remaining(p, 20_000, exp)).toBeCloseTo(40_000);
  });

  it("estimates time left from typical duration before writing starts", () => {
    const p = applyEvent(startProgress(0), { type: "phase", phase: "analyzing" }, 0);
    expect(remaining(p, 30_000, exp)).toBe(60_000);
    expect(remaining(p, 200_000, exp)).toBe(0);
  });

  it("learns typical duration and size from recent runs", () => {
    expect(expected("match", { durations: [], chars: [] })).toEqual({ duration: 90_000, chars: 16_000 });
    expect(expected("parse", { durations: [], chars: [] })).toEqual({ duration: 35_000, chars: 9_000 });
    expect(expected("match", { durations: [60_000, 120_000, 80_000], chars: [30_000, 20_000, 25_000] })).toEqual({ duration: 80_000, chars: 25_000 });
  });

  it("describes each step in plain words", () => {
    let p = startProgress(0);
    expect(label("match", p)).toMatch(/Sending/);
    p = applyEvent(p, { type: "phase", phase: "analyzing" }, 0);
    expect(label("match", p)).toMatch(/Analyzing/);
    p = applyEvent(p, { type: "progress", chars: 500, count: 0, stage: "summary" }, 0);
    expect(label("match", p)).toMatch(/Scoring/);
    p = applyEvent(p, { type: "progress", chars: 9_000, count: 3, stage: "suggestions" }, 0);
    expect(label("match", p)).toBe("Writing suggestions: 3 done…");
  });

  it("formats time left", () => {
    expect(remainingText(null)).toBe("");
    expect(remainingText(2_000)).toBe("Almost done");
    expect(remainingText(23_000)).toBe("About 25s left");
    expect(remainingText(130_000)).toBe("About 2 min left");
  });

  it("describes upload steps, including entries found so far", () => {
    let p = startProgress(0);
    expect(label("parse", p)).toBe("Uploading your resume…");
    p = applyEvent(p, { type: "phase", phase: "analyzing" }, 0);
    expect(label("parse", p)).toBe("Reading your resume…");
    p = applyEvent(p, { type: "progress", chars: 2_000, count: 1, stage: "resume" }, 0);
    expect(label("parse", p)).toBe("Extracting sections: 1 entry found…");
    p = applyEvent(p, { type: "progress", chars: 6_000, count: 7, stage: "ats" }, 0);
    expect(label("parse", p)).toBe("Running the ATS check…");
  });
});

describe("progress never goes backwards", () => {
  it("ignores late phase events and shrinking sizes", () => {
    let p = applyEvent(startProgress(0), { type: "progress", chars: 5_000, count: 3, stage: "suggestions" }, 10_000);
    p = applyEvent(p, { type: "phase", phase: "analyzing" }, 11_000);
    expect(p.phase).toBe("writing");
    p = applyEvent(p, { type: "progress", chars: 4_000, count: 2, stage: "suggestions" }, 12_000);
    expect(p.chars).toBe(5_000);
    expect(p.count).toBe(3);
  });

  it("is non-decreasing across a whole run", () => {
    const e = { duration: 60_000, chars: 10_000 };
    let p = startProgress(0);
    let last = 0;
    const steps: [number, Parameters<typeof applyEvent>[1] | null][] = [
      [1_000, null],
      [2_000, { type: "phase", phase: "analyzing" }],
      [20_000, null],
      [60_000, null],
      [61_000, { type: "progress", chars: 100, count: 0, stage: "summary" }],
      [70_000, { type: "progress", chars: 6_000, count: 4, stage: "suggestions" }],
      [80_000, { type: "progress", chars: 12_000, count: 9, stage: "suggestions" }],
    ];
    for (const [t, ev] of steps) {
      if (ev) p = applyEvent(p, ev, t);
      const v = percent(p, t, e);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
});
