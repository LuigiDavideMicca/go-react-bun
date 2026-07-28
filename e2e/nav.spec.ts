import { expect, test, type APIRequestContext } from "@playwright/test";

async function seedTasks(request: APIRequestContext, prefix: string, count: number) {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const res = await request.post("/api/tasks", { data: { title: `${prefix} ${i}` } });
    ids.push((await res.json()).task.ID);
  }
  return ids;
}

async function deleteTasks(request: APIRequestContext, ids: number[]) {
  for (const id of ids) await request.delete(`/api/tasks/${id}`);
}

test("viewport links prefetch their route chunk without interaction", async ({ page }) => {
  const chunk = page.waitForRequest(/\/assets\/(slow|hydration)-\w+\.js/, { timeout: 10_000 });
  await page.goto("/");
  await chunk;
});

test("hover prefetches props once and the click consumes them", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(300);

  const propsRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/slow?__borgo=props")) propsRequests.push(r.url());
  });

  await page.hover('nav a[href="/slow"]');
  await expect.poll(() => propsRequests.length, { timeout: 5000 }).toBe(1);

  await page.evaluate(() => ((window as any).__stayed = true));
  await page.click('nav a[href="/slow"]');
  await expect(page.locator("h1")).toHaveText("Streaming SSR");
  expect(new URL(page.url()).pathname).toBe("/slow");
  expect(propsRequests.length).toBe(1); // cached props were reused
  expect(await page.evaluate(() => (window as any).__stayed)).toBe(true); // no reload
});

test("scroll position restores on back and forward", async ({ page, request }) => {
  const ids = await seedTasks(request, "nav seed", 25);
  try {
    await page.goto("/");
    await page.evaluate(() => scrollTo(0, 800));
    await page.waitForTimeout(300);

    const visibleHref = await page.evaluate(() => {
      const links = [...document.querySelectorAll('ul a[href^="/tasks/"]')];
      const hit = links.find((a) => {
        const r = a.getBoundingClientRect();
        return r.top > 0 && r.bottom < innerHeight;
      });
      return hit?.getAttribute("href");
    });
    expect(visibleHref).toBeTruthy();

    await page.click(`ul a[href="${visibleHref}"]`);
    await expect(page.locator("a", { hasText: "Back home" })).toBeVisible();
    expect(await page.evaluate(() => scrollY)).toBe(0);

    await page.goBack();
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 5000 }).toBe(800);

    await page.goForward();
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 5000 }).toBeLessThan(5);
  } finally {
    await deleteTasks(request, ids);
  }
});

test("head updates on client navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Tasks · borgo");
  await page.click('nav a[href="/slow"]');
  await expect(page).toHaveTitle("Streaming · borgo tasks");
});
