import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mockAi } from "./fixtures";

/** Automated accessibility checks (axe, WCAG 2.1 A and AA) on every page, with the sample resume loaded. */

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  // Readable failure messages: rule, impact and where.
  return results.violations.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")})`);
}

async function loadSample(page: Page) {
  await mockAi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "No resume to hand? Try a sample" }).click();
  await page.waitForURL("**/ats");
}

test("upload page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("ATS, jobs and editor pages", async ({ page }) => {
  await loadSample(page);
  expect(await violations(page), "ATS page").toEqual([]);
  await page.goto("/job");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await violations(page), "Jobs page").toEqual([]);
  await page.goto("/editor");
  await expect(page.getByText(/Suggestions \(\d+ to review\)/)).toBeVisible();
  expect(await violations(page), "Editor").toEqual([]);
});

test("editor's compare and preview tabs, and the usage breakdown", async ({ page }) => {
  await loadSample(page);
  await page.goto("/editor");
  await page.getByRole("tab", { name: /Compare with original/ }).click();
  expect(await violations(page), "Compare").toEqual([]);
  await page.getByRole("tab", { name: "Preview & layout" }).click();
  await expect(page.getByRole("img", { name: /Page 1 of/ })).toBeVisible({ timeout: 30_000 });
  expect(await violations(page), "Preview").toEqual([]);
  await page.getByRole("button", { name: /matches left/ }).click();
  expect(await violations(page), "Usage breakdown").toEqual([]);
});

test("privacy page", async ({ page }) => {
  await page.goto("/privacy");
  expect(await violations(page)).toEqual([]);
});

test("phone layout", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loadSample(page);
  await page.goto("/editor");
  await expect(page.getByRole("link", { name: "Jump to your resume ↓" })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});
