import { expect, test, type Page } from "@playwright/test";

// Needs the `supabase db reset` seed. The photo flow also needs an S3-compatible bucket behind the
// R2_* variables (local Supabase Storage works: see .env.example), so it only runs with E2E_UPLOADS=1.
const unique = (base: string) => `${base} ${Math.random().toString(36).slice(2, 7)}`;

// A 1x1 PNG: the page decodes and re-encodes it like any photo from the camera roll.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const share = async (page: Page, item: RegExp) => {
  await page.getByRole("button", { name: "Share a memory" }).click();
  await page.getByRole("button", { name: item }).click();
};

let me = "";
test.beforeEach(async ({ page }) => {
  me = unique("Zara");
  await page.goto("/");
  await page.getByLabel("Your name").fill(me);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/wall$/);
});

test("the + button opens a menu of what to share and Escape closes it", async ({ page }) => {
  const fab = page.getByRole("button", { name: "Share a memory" });
  await fab.click();
  await expect(page.getByRole("button", { name: "Close share menu" })).toHaveAttribute("aria-expanded", "true");
  for (const label of [/1 photo or an album/, /Up to 60 seconds/, /Write to the couple/]) await expect(page.getByRole("button", { name: label })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(fab).toHaveAttribute("aria-expanded", "false");
});

test("a wish: chips fill the box, the counter counts, and the card appears without a reload", async ({ page }) => {
  await share(page, /Write to the couple/);
  const drawer = page.getByRole("dialog", { name: "Write a wish" });
  const send = drawer.getByRole("button", { name: "Send wish" });
  await expect(send).toBeDisabled();

  await drawer.getByRole("button", { name: "+ Congratulations!" }).click();
  await expect(drawer.getByLabel("Your wish")).toHaveValue("Congratulations!");
  await expect(drawer.getByText("16 / 300")).toBeVisible();
  const text = unique("Semoga bahagia");
  await drawer.getByLabel("Your wish").fill(text);
  await send.click();

  await expect(drawer).toBeHidden();
  await expect(page.getByText("Your wish has been sent to the couple.")).toBeVisible();
  await expect(page.getByRole("main").getByText(text)).toBeVisible();
  await expect(page.getByRole("main").getByText("You", { exact: true }).first()).toBeVisible();
});

test("a wish posted while another filter is selected switches the wall back to All", async ({ page }) => {
  await page.getByRole("button", { name: /^Videos/ }).click();
  await share(page, /Write to the couple/);
  const text = unique("Terima kasih");
  await page.getByLabel("Your wish").fill(text);
  await page.getByRole("button", { name: "Send wish" }).click();
  await expect(page.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("main").getByText(text)).toBeVisible();
});

test("a video drawer refuses a file that is not a video, and keeps Post disabled", async ({ page }) => {
  await share(page, /Up to 60 seconds/);
  const drawer = page.getByRole("dialog", { name: "Share a video" });
  await drawer.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(drawer.getByRole("alert")).toContainText("MP4 or MOV");
  await expect(drawer.getByRole("button", { name: "Post video" })).toBeDisabled();
});

test("photos: previews, the album hint, removing one, and the 10 photo limit", async ({ page }) => {
  await share(page, /1 photo or an album/);
  const drawer = page.getByRole("dialog", { name: "Share photos" });
  const input = drawer.locator('input[type="file"]');
  await expect(drawer.getByRole("button", { name: "Post photo" })).toBeDisabled();

  await input.setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PIXEL });
  await expect(drawer.getByText("1 photo selected")).toBeVisible();
  await expect(drawer.getByText("Add more to make an album")).toBeVisible();

  await input.setInputFiles(Array.from({ length: 2 }, (_, i) => ({ name: `b${i}.png`, mimeType: "image/png", buffer: PIXEL })));
  await expect(drawer.getByText("Will post as an album")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Post album (3)" })).toBeEnabled();

  await drawer.getByRole("button", { name: "Remove photo 1" }).click();
  await expect(drawer.getByText("2 photos selected")).toBeVisible();

  await input.setInputFiles(Array.from({ length: 12 }, (_, i) => ({ name: `c${i}.png`, mimeType: "image/png", buffer: PIXEL })));
  await expect(drawer.getByText("10 photos selected")).toBeVisible();
  await expect(drawer.getByRole("alert")).toContainText("Up to 10 photos per post.");
});

test("three photos become one album on the wall, uploaded straight to storage", async ({ page }) => {
  test.skip(!process.env.E2E_UPLOADS, "needs an S3-compatible bucket behind the R2_* variables");
  await share(page, /1 photo or an album/);
  const drawer = page.getByRole("dialog", { name: "Share photos" });
  await drawer.locator('input[type="file"]').setInputFiles(
    Array.from({ length: 3 }, (_, i) => ({ name: `p${i}.png`, mimeType: "image/png", buffer: PIXEL })),
  );
  await drawer.getByLabel(/Caption/).fill("Akad nikah");
  const puts = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes("X-Amz-Signature"));
  await drawer.getByRole("button", { name: "Post album (3)" }).click();
  expect((await puts).status()).toBe(200);

  await expect(drawer).toBeHidden();
  await expect(page.getByText("Shared! Your photos are on the wall as an album.")).toBeVisible();
  await expect(page.getByRole("link", { name: `Album by ${me}, 3 photos` })).toBeVisible();
});
