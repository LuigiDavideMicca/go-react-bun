import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countAssets, exportSummary, fillPattern, outputPath, planExport } from "../src/export";
import type { Route } from "../src/router";

const route = (pattern: string, module: Record<string, unknown>, islands = false): Route =>
  ({ pattern, file: pattern + ".tsx", module, layouts: [], islands }) as unknown as Route;

const page = () => null;

describe("planExport", () => {
  test("plain pages without loaders export", () => {
    const { plans, skipped, needApi } = planExport([route("/about", { default: page })]);
    expect(plans.map((p) => p.route.pattern)).toEqual(["/about"]);
    expect(skipped).toEqual([]);
    expect(needApi).toBe(false);
  });

  test("a loader without prerender skips with the reason", () => {
    const { plans, skipped } = planExport([route("/", { default: page, loader: async () => ({}) })]);
    expect(plans).toEqual([]);
    expect(skipped[0].reason).toContain("export const prerender = true");
  });

  test("a loader with prerender exports and needs the api", () => {
    const { plans, needApi } = planExport([
      route("/", { default: page, loader: async () => ({}), prerender: true }),
    ]);
    expect(plans).toHaveLength(1);
    expect(needApi).toBe(true);
  });

  test("dynamic routes need prerenderPaths", () => {
    const { plans, skipped } = planExport([route("/tasks/:id", { default: page })]);
    expect(plans).toEqual([]);
    expect(skipped[0].reason).toContain("prerenderPaths");
  });

  test("dynamic routes with prerenderPaths export dynamically", () => {
    const { plans, needApi } = planExport([
      route("/tasks/:id", { default: page, prerenderPaths: () => [{ id: 1 }] }),
    ]);
    expect(plans[0].dynamic).toBe(true);
    expect(needApi).toBe(true);
  });

  test("a _404 without a loader exports", () => {
    const { export404, needApi } = planExport([route("/about", { default: page })], route("*", { default: page }));
    expect(export404).toBe(true);
    expect(needApi).toBe(false);
  });

  test("a _404 with a loader needs prerender and then the api", () => {
    const plain = planExport([], route("*", { default: page, loader: async () => ({}) }));
    expect(plain.export404).toBe(false);
    expect(plain.skipped[0]).toEqual({ pattern: "404", reason: "has a loader without `export const prerender = true`" });

    const opted = planExport([], route("*", { default: page, loader: async () => ({}), prerender: true }));
    expect(opted.export404).toBe(true);
    expect(opted.needApi).toBe(true);
  });

  test("zero exportable pages still export an exportable _404", () => {
    const { plans, export404 } = planExport(
      [route("/", { default: page, loader: async () => ({}) })],
      route("*", { default: page }),
    );
    expect(plans).toEqual([]);
    expect(export404).toBe(true);
  });
});

describe("countAssets", () => {
  test("precompressed siblings fold into their base asset", () => {
    const dir = mkdtempSync(join(tmpdir(), "borgo-assets-"));
    try {
      mkdirSync(join(dir, "assets"));
      for (const f of ["assets/client.js", "assets/client.js.gz", "assets/client.js.br", "assets/style.css", "assets/style.css.gz", "logo.svg", "orphan.gz"]) {
        writeFileSync(join(dir, f), "x");
      }
      expect(countAssets(dir)).toEqual({ assets: 4, precompressed: 3 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("exportSummary", () => {
  test("404.html is its own line item and variants are mentioned once", () => {
    expect(exportSummary(5, true, 3, 6)).toBe("exported 5 pages + 404.html + 3 assets (with 6 precompressed variants)");
    expect(exportSummary(2, false, 1, 0)).toBe("exported 2 pages + 1 assets");
    expect(exportSummary(0, true, 0, 0)).toBe("exported 0 pages + 404.html + 0 assets");
  });
});

describe("fillPattern", () => {
  test("fills and encodes params", () => {
    expect(fillPattern("/tasks/:id", { id: 7 })).toBe("/tasks/7");
    expect(fillPattern("/a/:x/b/:y", { x: "one", y: "two three" })).toBe("/a/one/b/two%20three");
  });

  test("missing params throw with the pattern named", () => {
    expect(() => fillPattern("/tasks/:id", {})).toThrow("/tasks/:id");
  });
});

describe("outputPath", () => {
  test("directory-style html files", () => {
    expect(outputPath("/")).toBe("index.html");
    expect(outputPath("/about")).toBe("about/index.html");
    expect(outputPath("/tasks/7")).toBe("tasks/7/index.html");
    expect(outputPath("/trailing/")).toBe("trailing/index.html");
  });
});
