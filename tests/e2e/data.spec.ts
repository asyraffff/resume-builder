import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { mockAi, uploadSample, usageWith } from "./fixtures";

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
  await page.route("**/api/usage", (r) => r.fulfill({ json: usage }));
  await page.goto("/");
  await page.getByText("I understand my resume will be sent").click();
  await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  const card = page.getByRole("status").filter({ hasText: "You've used your uploads for now" });
  await expect(card).toContainText(/You can upload again at .+ \(in 10 min\)/);
  await expect(page.getByRole("alert").filter({ hasText: "limit" })).toHaveCount(0);
});

test("usage chip shows what's left, with a breakdown", async ({ page }) => {
  await page.route("**/api/usage", (r) => r.fulfill({ json: usageWith({ match: { remaining: 6, nextFreeInSec: 480 } }) }));
  await page.goto("/");
  const chip = page.getByRole("button", { name: /6 matches left/ });
  await chip.click();
  const panel = page.getByRole("dialog", { name: "Your AI usage" });
  await expect(panel).toContainText("6 of 8 left");
  await expect(panel).toContainText("15 of 15 left");
  await expect(panel).toContainText("Next one frees up in 8 min");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("warns beside the button when running low, and says when the app is paused", async ({ page }) => {
  let usage = usageWith({ "parse-resume": { remaining: 1, nextFreeInSec: 300 } });
  await page.route("**/api/usage", (r) => r.fulfill({ json: usage }));
  await page.goto("/");
  await expect(page.getByText("1 upload left, more in 5 min")).toBeVisible();

  usage = { ...usageWith({}), busy: { resetInSec: 7200 } };
  await page.reload();
  await expect(page.getByRole("button", { name: /AI paused/ })).toBeVisible();
  await expect(page.getByText("AI features are paused for today")).toBeVisible();
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
