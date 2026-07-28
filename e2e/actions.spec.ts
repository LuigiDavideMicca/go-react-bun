import { expect, test } from "@playwright/test";

test("form action creates a task and post/redirect/gets home", async ({ page, request }) => {
  const title = `action test ${Date.now()}`;
  await page.goto("/");
  await page.fill('input[name="title"]', title);
  await page.click("form button");

  await expect(page.locator("li", { hasText: title })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");

  const { tasks } = await (await request.get("/api/tasks")).json();
  const created = tasks.find((t: { title: string }) => t.title === title);
  expect(created).toBeTruthy();
  await request.delete(`/api/tasks/${created.ID}`);
});

test("action validation errors re-render with actionData", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[name="title"]', "");
  await page.click("form button");
  await expect(page.locator(".error")).toHaveText("give the task a title");
  expect(new URL(page.url()).pathname).toBe("/");
});
