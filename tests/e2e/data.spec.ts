import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { mockAi, uploadSample } from "./fixtures";

test("back up, delete all data, then restore from the backup", async ({ page }) => {
  await mockAi(page);
  await uploadSample(page);
  await page.goto("/");
  await expect(page.getByText("taylor_morgan.pdf")).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Back up all" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^resume-tailor-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.workspaces).toHaveLength(1);

  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete all my data" }).click();
  await page.waitForLoadState("load");
  await expect(page.getByText("taylor_morgan.pdf")).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("resume-tailor")))).toEqual([]);

  await page.locator('input[type="file"][accept*="json"]').setInputFiles((await download.path())!);
  await expect(page.getByText("Added 1 resume from the backup.")).toBeVisible();
  await expect(page.getByText("taylor_morgan.pdf")).toBeVisible();
});

test("shows the server's message when a limit is reached", async ({ page }) => {
  await page.route("**/api/parse-resume", (r) =>
    r.fulfill({ status: 429, contentType: "application/json", headers: { "Retry-After": "600" }, body: JSON.stringify({ error: "You've reached the limit for uploads. Please try again in 10 minutes." }) }),
  );
  await page.goto("/");
  await page.getByText("I understand my resume will be sent").click();
  await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(page.getByRole("alert").filter({ hasText: "limit" })).toContainText("reached the limit for uploads");
});

test("privacy page is linked from every page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
  await expect(page.getByText("Anthropic's privacy policy")).toBeVisible();
});
