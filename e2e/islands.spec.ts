import { expect, test } from "@playwright/test";

test("islands hydrate independently on a hydrate=false page", async ({ page }) => {
  await page.goto("/islands");

  const scripts = await page.$$eval("script[src]", (els) => els.map((e) => e.getAttribute("src")));
  expect(scripts).not.toContain("/assets/client.js");
  expect(scripts).toContain("/assets/islands-client.js");

  // the page itself never hydrates: no props script
  expect(await page.evaluate(() => "__PROPS__" in window)).toBe(false);

  // eager island is interactive
  const counters = page.locator("[data-testid=count]");
  await page.locator("button", { hasText: "+1" }).first().click();
  await expect(counters.first()).toHaveText("6");

  // visible island hydrates only when scrolled into view
  await expect(counters.nth(1)).toHaveText("0");
  await page.locator("[data-borgo-client=visible]").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.locator("button", { hasText: "+1" }).nth(1).click();
  await expect(counters.nth(1)).toHaveText("1");
});
