import { expect, test, type Page } from "@playwright/test";

// Needs the `supabase db reset` seed. The album flow also needs an S3-compatible bucket behind the
// R2_* variables (see create.spec.ts), so it only runs with E2E_UPLOADS=1.
const unique = (base: string) => `${base} ${Math.random().toString(36).slice(2, 7)}`;

const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const join = async (page: Page, name: string) => {
  await page.goto("/");
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/wall$/);
};

const sendWish = async (page: Page, text: string) => {
  await page.getByRole("button", { name: "Share a memory" }).click();
  await page.getByRole("button", { name: /Write to the couple/ }).click();
  await page.getByLabel("Your wish").fill(text);
  await page.getByRole("button", { name: "Send wish" }).click();
  await expect(page.getByRole("main").getByText(text)).toBeVisible();
};

let me = "";
test.beforeEach(async ({ page }) => {
  me = unique("Mira");
  await join(page, me);
});

test("a wish: only its author is offered delete, and Keep it keeps it", async ({ page }) => {
  const text = unique("Semoga bahagia");
  await sendWish(page, text);

  await page.getByRole("main").getByRole("button", { name: new RegExp(text) }).click();
  const drawer = page.getByRole("dialog", { name: "Wish" });
  await drawer.getByRole("button", { name: "Delete my wish" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this wish?" });
  await expect(confirm).toContainText("Guests will not see it anymore.");
  await confirm.getByRole("button", { name: "Keep it" }).click();
  await expect(confirm).toBeHidden();
  await expect(drawer).toBeVisible();

  await drawer.getByRole("button", { name: "Delete my wish" }).click();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".toast", { hasText: "Post deleted" })).toBeVisible();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("main").getByText(text)).toBeHidden();
});

test("someone else's wish has no delete button", async ({ page }) => {
  // The seed's wishes belong to other guests.
  await page.getByRole("main").getByRole("button", { name: /Selamat pengantin baru/ }).first().click();
  const drawer = page.getByRole("dialog", { name: "Wish" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Delete my wish" })).toHaveCount(0);
});

test("the name chip opens Me: own posts, delete from the list, and Switch name keeps the guest", async ({ page }) => {
  const text = unique("Terima kasih");
  await sendWish(page, text);

  await page.getByRole("button", { name: `Your name and posts, ${me}` }).click();
  const drawer = page.getByRole("dialog", { name: "You" });
  await expect(drawer.getByText("Remembered on this phone · no password")).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Your posts (1)" })).toBeVisible();

  await drawer.getByRole("button", { name: "Delete wish" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(drawer.getByText("You have not shared anything yet.")).toBeVisible();
  await expect(page.locator(".toast", { hasText: "Post deleted" })).toBeVisible();

  await drawer.getByRole("button", { name: "Switch name" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: `Continue as ${me}` })).toBeVisible();
  await page.getByRole("button", { name: `Continue as ${me}` }).click();
  await expect(page).toHaveURL(/\/wall$/);
});

test("a post that is gone says so, and a guest without a name is sent to enter one", async ({ page, context }) => {
  await page.goto("/p/00000000-0000-4000-8000-000000000999");
  await expect(page.getByRole("heading", { name: "This memory is no longer here" })).toBeVisible();
  await page.getByRole("link", { name: "Back to the wall" }).click();
  await expect(page).toHaveURL(/\/wall$/);

  await page.goto("/p/not-a-uuid");
  await expect(page.getByRole("heading", { name: "This memory is no longer here" })).toBeVisible();

  await context.clearCookies();
  await page.goto("/p/00000000-0000-4000-8000-000000000999");
  await expect(page).toHaveURL(/\/$/);
});

test("an album opens in the viewer, swipes by button and thumbnail, and its author can delete it", async ({ page }) => {
  test.skip(!process.env.E2E_UPLOADS, "needs an S3-compatible bucket behind the R2_* variables");
  await page.getByRole("button", { name: "Share a memory" }).click();
  await page.getByRole("button", { name: /1 photo or an album/ }).click();
  const drawer = page.getByRole("dialog", { name: "Share photos" });
  await drawer.locator('input[type="file"]').setInputFiles(
    Array.from({ length: 3 }, (_, i) => ({ name: `p${i}.png`, mimeType: "image/png", buffer: PIXEL })),
  );
  await drawer.getByLabel(/Caption/).fill("Akad nikah");
  await drawer.getByRole("button", { name: "Post album (3)" }).click();
  await expect(drawer).toBeHidden();

  await page.getByRole("link", { name: `Album by ${me}, 3 photos` }).click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.getByRole("heading", { name: me })).toBeVisible();
  await expect(page.getByText("Album · 3 photos")).toBeVisible();
  await expect(page.getByText("Akad nikah")).toBeVisible();
  await expect(page.getByText("1 / 3")).toBeVisible();

  await page.getByRole("button", { name: "Next photo" }).click();
  await expect(page.getByText("2 / 3")).toBeVisible();
  await page.getByRole("button", { name: "Show photo 3 of 3" }).click();
  await expect(page.getByText("3 / 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next photo" })).toHaveAttribute("aria-disabled", "true");

  await page.getByRole("button", { name: "Delete this post" }).click();
  await page.getByRole("alertdialog", { name: "Delete this album?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/wall$/);
  await expect(page.locator(".toast", { hasText: "Post deleted" })).toBeVisible();
  await expect(page.getByRole("link", { name: `Album by ${me}, 3 photos` })).toBeHidden();
});
