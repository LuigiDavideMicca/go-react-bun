import { expect, test } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const appDir = join(process.cwd(), "examples", "tasks");
const pageFile = join(appDir, "pages", "hydration.tsx");
const cssFile = join(appDir, "style.scss");
const layoutFile = join(appDir, "pages", "_layout.tsx");
const base = "http://localhost:3410";

let server: ChildProcess;
const originals = new Map<string, string>();

function snapshot(path: string) {
  originals.set(path, readFileSync(path, "utf8"));
}

function restoreAll() {
  for (const [path, content] of originals) writeFileSync(path, content);
}

test.beforeAll(async () => {
  for (const f of [pageFile, cssFile, layoutFile]) snapshot(f);
  server = spawn("bun", ["run", "dev"], {
    cwd: appDir,
    shell: process.platform === "win32",
    stdio: "ignore",
    env: { ...process.env, PORT: "3410", API_PORT: "3911", DB_PATH: "e2e-dev.db" },
  });
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const res = await fetch(base + "/hydration");
      if (res.ok) break;
    } catch {}
    if (Date.now() > deadline) throw new Error("dev server never became ready");
    await new Promise((r) => setTimeout(r, 500));
  }
});

test.afterAll(() => {
  restoreAll();
  if (!server?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
  } else {
    server.kill("SIGINT");
  }
});

test("component edits fast-refresh and keep state", async ({ page }) => {
  await page.goto(base + "/hydration");
  await page.evaluate(() => ((window as any).__stayed = true));

  await page.locator("[data-borgo-visible]").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  for (let i = 0; i < 3; i++) await page.click("section button");
  await expect(page.locator("section button")).toContainText("clicked 3 times");

  writeFileSync(
    pageFile,
    originals.get(pageFile)!.replace("<h2>Now hydrated</h2>", "<h2>Now hydrated — EDITED</h2>"),
  );

  await expect(page.locator("section h2")).toHaveText("Now hydrated — EDITED", { timeout: 15_000 });
  await expect(page.locator("section button")).toContainText("clicked 3 times");
  expect(await page.evaluate(() => (window as any).__stayed)).toBe(true);
});

test("css edits hot-swap without a reload", async ({ page }) => {
  await page.goto(base + "/hydration");
  await page.evaluate(() => ((window as any).__stayed = true));

  writeFileSync(cssFile, originals.get(cssFile)! + "\nh1 { letter-spacing: 3px; }\n");
  await expect
    .poll(
      () => page.evaluate(() => getComputedStyle(document.querySelector("h1")!).letterSpacing),
      { timeout: 15_000 },
    )
    .toBe("3px");
  expect(await page.evaluate(() => (window as any).__stayed)).toBe(true);
  writeFileSync(cssFile, originals.get(cssFile)!);
});

test("layout edits fall back to a full reload", async ({ page }) => {
  await page.goto(base + "/");
  await page.evaluate(() => ((window as any).__stayed = true));

  writeFileSync(
    layoutFile,
    originals.get(layoutFile)!.replace(
      "demo app for the borgo framework",
      "demo app for the borgo framework — edited",
    ),
  );

  await expect(page.locator("footer")).toContainText("framework — edited", { timeout: 20_000 });
  expect(await page.evaluate(() => (window as any).__stayed)).toBeUndefined();
  writeFileSync(layoutFile, originals.get(layoutFile)!);
});
