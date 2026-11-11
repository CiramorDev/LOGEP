import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(page.locator("#empty-state")).toBeVisible();
});

test("creates a project and task through the editor", async ({ page }) => {
  await page.getByRole("button", { name: "+ Project" }).click();
  await expect(page.locator("#edit-dialog")).toBeVisible();
  await page.locator("#item-title").fill("Release planning");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator(".node-row")).toHaveCount(1);
  await expect(page.locator(".title-field")).toHaveValue("Release planning");
  await expect(page.locator("#project-count")).toHaveText("1");
  await expect(page.getByRole("button", { name: "+ Task / meeting" })).toBeEnabled();

  await page.locator(".node-row").click();
  await page.getByRole("button", { name: "+ Task / meeting" }).click();
  await page.locator("#item-title").fill("Confirm scope");
  await page.locator("#item-status").selectOption("Done");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator(".node-row")).toHaveCount(2);
  await expect(page.locator("#task-count")).toHaveText("1");
  await expect(page.locator("#pending-count")).toHaveText("0");
});

test("keeps the selected row while interacting with the creation dialog", async ({
  page,
}) => {
  await page.getByRole("button", { name: "+ Project" }).click();
  await page.locator("#item-title").fill("Release planning");
  await page.getByRole("button", { name: "Save" }).click();

  const row = page.locator(".node-row");
  await row.click();
  await expect(row).toHaveClass(/selected/);

  await page.getByRole("button", { name: "+ Task / meeting" }).click();
  await page.locator("#item-title").click();
  await page.locator("#item-content").click();
  await page.locator("#item-date").click();
  await page.locator("#item-status").click();

  await expect(row).toHaveClass(/selected/);
});

test("filters rows and toggles the saved view and theme", async ({ page }) => {
  await page.getByRole("button", { name: "+ Project" }).click();
  await page.locator("#item-title").fill("Visible project");
  await page.getByRole("button", { name: "Save" }).click();
  await page.locator("#search").fill("does not exist");
  await expect(page.locator(".node-row")).toHaveCount(0);
  await expect(page.locator("#empty-state")).toBeVisible();

  await page.locator("#search").fill("");
  await page.locator("#view-mode").selectOption("collapsed");
  await expect(page.locator("#view-mode")).toHaveValue("collapsed");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
