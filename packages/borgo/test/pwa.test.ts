import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { manifest, pwaInit, serviceWorker } from "../src/pwa";

const app = () => {
  const dir = mkdtempSync(join(tmpdir(), "borgo-pwa-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "notes" }));
  return dir;
};

describe("manifest", () => {
  test("is valid json naming the app", () => {
    const m = JSON.parse(manifest("notes"));
    expect(m.name).toBe("notes");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.icons.length).toBeGreaterThan(0);
  });

  test("short_name stays within the length browsers show", () => {
    const m = JSON.parse(manifest("an-extremely-long-application-name"));
    expect(m.short_name.length).toBeLessThanOrEqual(12);
  });
});

describe("service worker", () => {
  const sw = serviceWorker();

  test("keys its cache on the precache stamp", () => {
    expect(sw).toContain("/assets/precache.json");
    expect(sw).toContain('"app-" + stamp');
  });

  test("never caches the manifest that tells it which stamp is current", () => {
    // a cached manifest pins the worker to an old build permanently
    expect(sw).toContain("url.pathname === MANIFEST");
  });

  test("only handles same-origin GETs under /assets", () => {
    expect(sw).toContain('event.request.method !== "GET"');
    expect(sw).toContain("url.origin !== location.origin");
    expect(sw).toContain('!url.pathname.startsWith("/assets/")');
  });

  test("drops old caches but keeps the current stamp", () => {
    expect(sw).toContain('key !== "app-" + stamp');
  });

  test("is syntactically valid javascript", () => {
    // a generated worker that does not parse is worse than none
    expect(() => new Function(sw.replace(/\bself\b/g, "globalThis"))).not.toThrow();
  });
});

describe("pwa init", () => {
  test("writes both files into public/ and reports success", () => {
    const dir = app();
    expect(pwaInit(false, dir)).toBe(0);
    expect(existsSync(join(dir, "public", "manifest.webmanifest"))).toBe(true);
    expect(existsSync(join(dir, "public", "sw.js"))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "public", "manifest.webmanifest"), "utf8")).name).toBe(
      "notes",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("creates public/ when the app does not have one yet", () => {
    const dir = app();
    expect(existsSync(join(dir, "public"))).toBe(false);
    expect(pwaInit(false, dir)).toBe(0);
    expect(existsSync(join(dir, "public", "sw.js"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("refuses to overwrite an existing worker without --force", () => {
    const dir = app();
    mkdirSync(join(dir, "public"));
    writeFileSync(join(dir, "public", "sw.js"), "// mine");
    expect(pwaInit(false, dir)).toBe(1);
    expect(readFileSync(join(dir, "public", "sw.js"), "utf8")).toBe("// mine");
    // and nothing else was written alongside it
    expect(existsSync(join(dir, "public", "manifest.webmanifest"))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("--force overwrites", () => {
    const dir = app();
    mkdirSync(join(dir, "public"));
    writeFileSync(join(dir, "public", "sw.js"), "// mine");
    expect(pwaInit(true, dir)).toBe(0);
    expect(readFileSync(join(dir, "public", "sw.js"), "utf8")).toContain("precache.json");
    rmSync(dir, { recursive: true, force: true });
  });
});
