import { expect, test } from "@playwright/test";

// Needs `supabase db reset` seed data: guest "Ali" exists, so that name is taken.
const unique = (base: string) => `${base} ${Math.random().toString(36).slice(2, 7)}`;

test("a taken name offers suggestions, a free name reaches the wall, and this phone remembers it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("&");

  await page.getByLabel("Your name").fill("ali");
  await page.getByRole("button", { name: "Start" }).click();
  // Next's route announcer is also role="alert", so match ours by its text.
  await expect(page.getByRole("alert").filter({ hasText: "already used by another guest" })).toBeVisible();

  // Suggestions are the first two free variants of the name that was tried.
  const chip = page.getByRole("button", { name: /^Use “ali/i }).first();
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.getByLabel("Your name")).toHaveValue(/^ali /i);

  const mine = unique("Zara");
  await page.getByLabel("Your name").fill(mine);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/wall$/);
  await expect(page.locator(".toast", { hasText: `Welcome, ${mine}` })).toBeVisible();

  // Back on the welcome screen the phone offers the name it remembers.
  await page.request.delete("/api/session");
  await page.goto("/");
  await page.getByRole("button", { name: `Continue as ${mine}` }).click();
  await expect(page).toHaveURL(/\/wall$/);
});
