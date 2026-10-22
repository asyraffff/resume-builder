import { expect, test } from "@playwright/test";
import { jobText, mockAi, uploadSample } from "./fixtures";

test("full journey: consent, upload, ATS, add a job, tailor, compare, preview and export", async ({ page }) => {
  const calls = await mockAi(page);

  // Upload is blocked until the privacy notice is acknowledged.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose file" })).toBeDisabled();

  await uploadSample(page);
  expect(calls.parseResume).toBe(1);
  await expect(page.getByRole("heading", { name: "ATS check", level: 1 })).toBeVisible();
  await expect(page.getByText("Non-standard section headings")).toBeVisible();

  // Step 3: add a job by pasting its description; the match runs automatically.
  await page.getByRole("link", { name: /Next: Job descriptions/ }).click();
  await page.getByPlaceholder(/Paste the full job description/).fill(jobText);
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(page.getByRole("heading", { name: "FoodRush – Senior Frontend Engineer" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Match: \d+ out of 100/ })).toBeVisible();
  expect(calls.parseJd).toBe(1);
  expect(calls.match).toBe(1);

  // Step 4: tailor.
  await page.getByRole("button", { name: "Tailor resume →" }).click();
  await page.waitForURL("**/editor");
  await expect(page.getByText("Suggestions (4 to review)")).toBeVisible();
  await page.getByRole("button", { name: /Accept all safe \(4\)/ }).click();
  await expect(page.getByText("Applied 4 suggestions.")).toBeVisible();
  await expect(page.getByText("Built customer-facing features for the React ordering app")).toBeVisible();
  await expect(page.getByText("Attended daily standups")).toHaveCount(0);

  // Live ATS check reflects the renamed heading (no more non-standard headings issue).
  await expect(page.getByText("ATS check · this version")).toBeVisible();
  await expect(page.getByText("Non-standard section headings")).toHaveCount(0);

  // Compare with the uploaded resume.
  await page.getByRole("tab", { name: /Compare with original \(4\)/ }).click();
  await expect(page.getByText("4 changes from your uploaded resume")).toBeVisible();

  // Real PDF preview, drawn page by page.
  await page.getByRole("tab", { name: "Preview & layout" }).click();
  await expect(page.getByRole("img", { name: "Page 1 of 1" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("radio", { name: /Modern/ }).click();
  await expect(page.getByRole("img", { name: "Page 1 of 1" })).toBeVisible({ timeout: 30_000 });

  // Export both formats; the export warns about the missing phone number first.
  page.on("dialog", (d) => d.accept());
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /PDF/ }).click()]);
  expect(pdf.suggestedFilename()).toBe("Taylor_Morgan_FoodRush_Senior_Frontend_Engineer.pdf");
  const [docx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Word" }).click()]);
  expect(docx.suggestedFilename()).toBe("Taylor_Morgan_FoodRush_Senior_Frontend_Engineer.docx");
});

test("step navigation and the old /analyze address", async ({ page }) => {
  await mockAi(page);
  await uploadSample(page);
  await page.getByRole("link", { name: /4\.\s*Tailor/ }).click();
  await page.waitForURL("**/editor");
  await page.getByRole("link", { name: /Back: Job descriptions/ }).click();
  await page.waitForURL("**/job");
  await page.goto("/analyze");
  await page.waitForURL("**/ats");
  await expect(page.getByRole("heading", { name: "ATS check", level: 1 })).toBeVisible();
});
