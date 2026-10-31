import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Automated accessibility pass (axe, WCAG 2.0/2.1 A + AA) over every screen a guest can reach, in the default
// and the wireframe theme. It adds no posts and needs the `supabase db reset` seed (the post viewer opens a seed post), so it runs in the first
// group of projects (see playwright.config.ts). Not covered: the confirm dialog (deleting needs an own post,
// which would add data; create.spec/view.spec cover its behaviour) and anything behind the admin passcode.
const unique = (base: string) => `${base} ${Math.random().toString(36).slice(2, 7)}`;
const SEED_PHOTO = "/p/b0000000-0000-4000-8000-000000000003"; // Ali's photo, "The cake!"

async function audit(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Next's dev overlay (a portal outside our markup) is not part of the app.
    .exclude("nextjs-portal")
    .analyze();
  const report = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  expect(report, `${where}: axe violations`).toEqual([]);
}

async function join(page: Page) {
  await page.goto("/");
  await page.getByLabel("Your name").fill(unique("Zara"));
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/wall$/);
  await expect(page.getByRole("main").getByRole("listitem").first()).toBeVisible();
}

async function openFromMenu(page: Page, label: RegExp) {
  await page.getByRole("button", { name: "Share a memory" }).click();
  await page.getByRole("button", { name: label }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const theme of ["default", "wireframe"] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      // Settled frames only: no half-faded drawers or scrims in the contrast checks.
      await page.emulateMedia({ reducedMotion: "reduce" });
      if (theme === "wireframe") {
        await page.addInitScript(() => document.documentElement.setAttribute("data-theme", "wireframe"));
      }
    });

    test("welcome screen, also with the taken-name error", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("&");
      await audit(page, "welcome");

      await page.getByLabel("Your name").fill("ali");
      await page.getByRole("button", { name: "Start" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "already used by another guest" })).toBeVisible();
      await audit(page, "welcome with taken name");
    });

    test("wall, every drawer from the + menu, Me and the wish view", async ({ page }) => {
      await join(page);
      await audit(page, "wall");

      await page.getByRole("button", { name: "Share a memory" }).click();
      await expect(page.getByRole("button", { name: /Write to the couple/ })).toBeVisible();
      await audit(page, "wall with the + menu open");
      await page.getByRole("button", { name: "Close share menu" }).click();

      for (const [label, name] of [
        [/1 photo or an album/, "photos drawer"],
        [/Up to \d+ seconds/, "video drawer"],
        [/Write to the couple/, "wish drawer"],
        [/Send a gift/, "DuitNow QR drawer"],
      ] as const) {
        await openFromMenu(page, label);
        await audit(page, name);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toBeHidden();
      }

      await page.getByRole("button", { name: /^Your name and posts/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await audit(page, "Me drawer");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();

      await page.getByRole("button", { name: /^Wishes \d+/ }).click();
      await page.getByRole("main").getByRole("button").first().click();
      await expect(page.getByRole("dialog", { name: "Wish" })).toBeVisible();
      await audit(page, "wish view drawer");
    });

    test("post viewer for a seed photo", async ({ page }) => {
      await join(page);
      await page.goto(SEED_PHOTO);
      await expect(page.getByRole("button", { name: /back/i }).first()).toBeVisible();
      await audit(page, "post viewer");
    });

    test("admin login screen", async ({ page }) => {
      await page.goto("/admin");
      await expect(page.getByLabel("Passcode")).toBeVisible();
      await audit(page, "admin login");
    });
  });
}
