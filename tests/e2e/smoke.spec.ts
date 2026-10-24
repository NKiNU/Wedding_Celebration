import { expect, test } from "@playwright/test";

test("home renders with themed script heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Wedding Memories" })).toBeVisible();
});
