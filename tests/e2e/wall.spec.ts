import { expect, test } from "@playwright/test";

// Needs the `supabase db reset` seed: 10 visible posts (4 photos incl. 2 albums, 1 video, 5 wishes)
// and one hidden post that must never appear.
const unique = (base: string) => `${base} ${Math.random().toString(36).slice(2, 7)}`;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Your name").fill(unique("Zara"));
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/wall$/);
});

test("the wall shows the seeded memories, counts per filter, and never the hidden post", async ({ page }) => {
  await expect(page.getByText("10 memories shared")).toBeVisible();
  await expect(page.getByRole("button", { name: "All 10" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Photos 4" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Videos 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wishes 5" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(10);
  await expect(page.getByText("Blurry, please hide")).toHaveCount(0);
});

test("filters narrow the grid and the pills stay on screen while scrolling", async ({ page }) => {
  await page.getByRole("button", { name: "Videos 1" }).click();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /^Video by/ })).toBeVisible();

  await page.getByRole("button", { name: "Photos 4" }).click();
  await expect(page.getByRole("link", { name: /^(Photo|Album) by/ })).toHaveCount(4);

  await page.getByRole("button", { name: "All 10" }).click();
  await page.evaluate(() => window.scrollTo(0, 600)); // mobile WebKit has no mouse wheel
  await expect(page.getByRole("navigation", { name: "Filter memories" })).toBeInViewport();
});

test("a wish opens in a drawer from its card and from the ticker, and Escape closes it", async ({ page }) => {
  await page.getByRole("button", { name: "Wishes 5" }).click();
  await page.getByRole("main").getByRole("button").first().click();
  const drawer = page.getByRole("dialog", { name: "Wish" });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  await page.getByRole("button", { name: /^Latest wishes/ }).click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toBeHidden();
});

test("an album card shows how many photos it holds", async ({ page }) => {
  await expect(page.getByRole("link", { name: "Album by Nazrul, 5 photos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Album by Mei Ling, 3 photos" })).toBeVisible();
});
