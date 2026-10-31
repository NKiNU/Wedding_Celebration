import { expect, test, type Browser, type Page } from "@playwright/test";

// Needs the local stack and the same passcode as the dev server: ADMIN_PASSCODE=... npx playwright test admin
// Runs after every other spec (see playwright.config.ts): closing uploads would break theirs.
const passcode = process.env.ADMIN_PASSCODE;
test.skip(!passcode, "set ADMIN_PASSCODE to the dev server's passcode");
test.describe.configure({ mode: "serial" });

const unique = (base: string) => `${base} ${Math.random().toString(36).slice(2, 7)}`;

async function adminPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/admin");
  await page.getByLabel("Passcode").fill(passcode!);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByRole("heading", { name: "The couple" })).toBeVisible();
  return page;
}

async function guestOnWall(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/wall$/);
  return page;
}

test("a wrong passcode is refused, the right one opens the dashboard", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/admin");
  await page.getByLabel("Passcode").fill("definitely-wrong");
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText(/isn’t right/);

  await page.getByLabel("Passcode").fill(passcode!);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByRole("heading", { name: "Posts" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByLabel("Passcode")).toBeVisible();
});

test("hide, unhide and delete reach a guest's open wall", async ({ browser }) => {
  const text = unique("Semoga kekal");
  const guest = await guestOnWall(browser, unique("Hana"));
  await guest.getByRole("button", { name: "Share a memory" }).click();
  await guest.getByRole("button", { name: /Write to the couple/ }).click();
  await guest.getByLabel("Your wish").fill(text);
  await guest.getByRole("button", { name: "Send wish" }).click();
  const onWall = guest.getByRole("main").getByText(text);
  await expect(onWall).toBeVisible();

  const admin = await adminPage(browser);
  const row = admin.getByRole("listitem").filter({ hasText: text });
  await row.getByRole("button", { name: "Hide" }).click();
  await expect(row.getByText("Hidden")).toBeVisible();
  await expect(onWall).toBeHidden({ timeout: 15_000 });

  await row.getByRole("button", { name: "Unhide" }).click();
  await expect(onWall).toBeVisible({ timeout: 15_000 });

  await row.getByRole("button", { name: "Delete" }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);
  await expect(onWall).toBeHidden({ timeout: 15_000 });
});

test("closing uploads leaves guests only the DuitNow QR", async ({ browser }) => {
  const admin = await adminPage(browser);
  const toggle = admin.getByRole("switch", { name: "Guests can upload" });
  const guest = await guestOnWall(browser, unique("Hana"));
  try {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await guest.reload();
    await guest.getByRole("button", { name: "Share a memory" }).click();
    const menu = guest.getByRole("list", { name: "Share something" });
    await expect(menu.getByRole("button")).toHaveCount(1);
    await expect(menu.getByRole("button", { name: /DuitNow QR/ })).toBeVisible();
    await expect(menu).toContainText("Sharing is closed");

    await menu.getByRole("button", { name: /DuitNow QR/ }).click();
    await expect(guest.getByRole("dialog", { name: "DuitNow QR" })).toBeVisible();
  } finally {
    if ((await toggle.getAttribute("aria-checked")) === "false") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  }
});
