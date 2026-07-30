import { expect, test, type Page } from "@playwright/test";

// register -> account -> logout -> login exercises the full auth loop:
// go handlers set and clear the session, the front server forwards the
// cookies, the loader guard redirects, and csrf protects the forms
test("register, protected page, logout, login round trip", async ({ page }) => {
  const username = `user${Date.now()}`;
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/register");
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "pw123456");
  await page.click("form button");
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.locator("main strong")).toHaveText(username);

  await page.click("form button"); // log out
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);

  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "pw123456");
  await page.click("form button");
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.locator("main strong")).toHaveText(username);

  // csrf hydration must be clean: a token mismatch would log a react error
  expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
});

test("wrong password re-renders with an error", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="username"]', "nobody");
  await page.fill('input[name="password"]', "wrong");
  await page.click("form button");
  await expect(page.locator(".error")).toHaveText("wrong username or password");
});

async function login(page: Page, username: string) {
  await page.goto("/register");
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "pw123456");
  await page.click("form button");
  await expect(page).toHaveURL(/\/account$/);
}

test("a forged post without the csrf token is rejected", async ({ page }) => {
  await login(page, `csrf${Date.now()}`);

  // page.request shares the browser's cookies (session + csrf) but sends no
  // token field - exactly what a cross-origin form post looks like
  const forged = await page.request.post("/", {
    form: { title: "forged task" },
    maxRedirects: 0,
  });
  expect(forged.status()).toBe(403);

  const wrongToken = await page.request.post("/", {
    form: { title: "forged task", __borgo_csrf: "0000feed" },
    maxRedirects: 0,
  });
  expect(wrongToken.status()).toBe(403);

  // the real form carries the hidden field and passes
  const title = `csrf ok ${Date.now()}`;
  await page.goto("/");
  await page.fill('input[name="title"]', title);
  await page.click("form button");
  await expect(page.locator("li", { hasText: title })).toBeVisible();

  const { tasks } = await (await page.request.get("/api/tasks")).json();
  const created = tasks.find((t: { title: string }) => t.title === title);
  await page.request.delete(`/api/tasks/${created.ID}`);
});
