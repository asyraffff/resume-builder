import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { mockAi, seedUsage, uploadSample, usageWith } from "./fixtures";

test("back up, delete all data, then restore from the backup", async ({ page }) => {
  await mockAi(page);
  await uploadSample(page);
  await page.goto("/");
  await expect(page.getByText("taylor_morgan.pdf")).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Back up all" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^resume-tailor-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.workspaces).toHaveLength(1);

  await page.getByRole("button", { name: "Delete all my data" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete everything" }).click();
  await page.waitForLoadState("load");
  await expect(page.getByText("taylor_morgan.pdf")).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("resume-tailor")))).toEqual([]);

  await page.locator('input[type="file"][accept*="json"]').setInputFiles((await download.path())!);
  await page.getByRole("dialog").getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Added 1 resume from the backup.")).toBeVisible();
  await expect(page.getByText("taylor_morgan.pdf")).toBeVisible();
});

test("a reached limit shows when to come back instead of an error", async ({ page }) => {
  const usage = usageWith({ "parse-resume": { remaining: 0, nextFreeInSec: 600 } });
  await page.route("**/api/parse-resume", (r) =>
    r.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "Retry-After": "600" },
      body: JSON.stringify({ error: "You've reached the limit for uploads.", limitReached: true, usage }),
    }),
  );
  await page.goto("/");
  await page.getByText("I understand my resume will be sent").click();
  await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  const card = page.getByRole("status").filter({ hasText: "You've used your uploads for now" });
  await expect(card).toContainText(/You can upload again at .+ \(in 10 min\)/);
  await expect(page.getByRole("alert").filter({ hasText: "limit" })).toHaveCount(0);
});

test("the usage meter counts requests as they happen", async ({ page }) => {
  await mockAi(page);
  await uploadSample(page);
  await page.getByRole("button", { name: /8 matches left/ }).click();
  const panel = page.getByRole("region", { name: "Your AI usage" });
  await expect(panel).toContainText("1 of 6 used");
  await expect(panel).toContainText("None used · 8 per 10 minutes");
});

test("usage chip shows what's left, with a breakdown", async ({ page }) => {
  await seedUsage(page, { hits: { match: [-2, -1] } });
  await page.goto("/");
  await page.getByRole("button", { name: /6 matches left/ }).click();
  const panel = page.getByRole("region", { name: "Your AI usage" });
  await expect(panel).toContainText("6 left");
  await expect(panel).toContainText("2 of 8 used · next frees up in 8 min");
  await expect(panel).toContainText("None used · 15 per 10 minutes");
  await expect(panel.getByRole("meter", { name: "matches used" })).toHaveAttribute("aria-valuenow", "2");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("uses the server's numbers when its counts are shared (e.g. matches from another device)", async ({ page }) => {
  await page.route("**/api/usage", (r) => r.fulfill({ json: { shared: true, usage: usageWith({ match: { remaining: 3, nextFreeInSec: 300 } }) } }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /3 matches left/ })).toBeVisible();
});

test("warns beside the button when running low", async ({ page }) => {
  await seedUsage(page, { hits: { "parse-resume": [-5, -4, -3, -2, -1] } });
  await page.goto("/");
  await expect(page.getByText("1 upload left, more in 5 min")).toBeVisible();
});

test("says when the whole app is paused", async ({ page }) => {
  await seedUsage(page, { busyInMin: 120 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /AI paused/ })).toBeVisible();
  await expect(page.getByText("AI features are paused for today")).toBeVisible();
});

test("the usage chip doesn't overlap the steps on a narrower screen", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 800 });
  await mockAi(page);
  await uploadSample(page);
  await page.goto("/editor");
  const step = await page.locator('header [aria-current="step"]').boundingBox();
  const chip = await page.getByRole("button", { name: /matches left/ }).boundingBox();
  expect(step!.x + step!.width).toBeLessThanOrEqual(chip!.x);
});

test("privacy page is linked from every page, and security headers are sent", async ({ page }) => {
  const res = await page.goto("/");
  const headers = res!.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
  await expect(page.getByText("Anthropic's privacy policy")).toBeVisible();
});
