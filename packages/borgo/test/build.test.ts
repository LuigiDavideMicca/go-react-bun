import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateManifest, parseHydrate, refreshFooter } from "../src/build";

describe("parseHydrate", () => {
  const cases: Array<[string, string, string]> = [
    ["no export", "export default function P() {}", "true"],
    ["false", "export const hydrate = false;", "false"],
    ["true", "export const hydrate = true;", "true"],
    ["visible double quotes", 'export const hydrate = "visible";', '"visible"'],
    ["visible single quotes", "export const hydrate = 'visible';", '"visible"'],
    ["typed export", "export const hydrate: HydrateMode = false;", "false"],
  ];
  for (const [name, source, want] of cases) {
    test(name, () => {
      expect(parseHydrate(source)).toBe(want);
    });
  }
});

describe("refreshFooter", () => {
  test("registers top-level capitalized functions and consts", () => {
    const js = [
      "function Page() {}",
      "export default function Home() {}",
      "const Card = () => null;",
      "export const Nav = () => null;",
      "function helper() {}",
      "const util = 1;",
    ].join("\n");
    const footer = refreshFooter(js, "pages/index.tsx");
    for (const name of ["Page", "Home", "Card", "Nav"]) {
      expect(footer).toContain(`$RefreshRuntime$.register(${name},`);
      expect(footer).toContain(`"pages/index.tsx#${name}"`);
    }
    expect(footer).not.toContain("helper");
    expect(footer).not.toContain("util");
  });

  test("empty when no components", () => {
    expect(refreshFooter("const x = 1;", "m")).toBe("");
  });
});

describe("generateManifest", () => {
  const originalCwd = process.cwd();
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "borgo-manifest-"));
    const write = (path: string, content: string) => {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      return Bun.write(join(dir, path), content);
    };
    await write("pages/_layout.tsx", "export default function L({ children }) { return children; }");
    await write("pages/index.tsx", "export default function Home() { return null; }");
    await write(
      "pages/about.tsx",
      'import { Island } from "borgo";\nexport const hydrate = false;\nexport default function About() { return <Island name="Counter" />; }',
    );
    await write(
      "pages/deep/lazy.tsx",
      'export const hydrate = "visible";\nexport default function Lazy() { return null; }',
    );
    await write("pages/_404.tsx", "export default function NotFound() { return null; }");
    await write("islands/Counter.tsx", "export default function Counter() { return null; }");
    process.chdir(dir);
    await generateManifest();
  });

  afterAll(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  test("server manifest has every page with layouts and islands flags", async () => {
    const manifest = await Bun.file(join(dir, ".borgo/routes.gen.tsx")).text();
    expect(manifest).toContain('{ pattern: "/", file: "index.tsx", module: page0, layouts: [layout0], islands: false }');
    expect(manifest).toContain('{ pattern: "/about", file: "about.tsx", module: page1, layouts: [layout0], islands: true }');
    expect(manifest).toContain('pattern: "/deep/lazy"');
    expect(manifest).toContain("export const notFound: Route | null = { pattern");
    expect(manifest).toContain("export const serverError: Route | null = null;");
  });

  test("client manifest excludes hydrate=false pages and keeps hydrate modes", async () => {
    const manifest = await Bun.file(join(dir, ".borgo/client-routes.gen.ts")).text();
    expect(manifest).not.toContain('"about.tsx"');
    expect(manifest).toContain('file: "index.tsx", hydrate: true');
    expect(manifest).toContain('file: "deep/lazy.tsx", hydrate: "visible"');
    expect(manifest).toContain("export const notFound: ClientRoute | null =");
  });

  test("islands manifest registers islands by file name", async () => {
    const manifest = await Bun.file(join(dir, ".borgo/islands.gen.ts")).text();
    expect(manifest).toContain('import island0 from "../islands/Counter";');
    expect(manifest).toContain('"Counter": island0,');
  });

  test("dynamic segments sort after static ones", async () => {
    await Bun.write(
      join(dir, "pages/deep/[id].tsx"),
      "export default function D() { return null; }",
    );
    await Bun.write(join(dir, "pages/deep/static.tsx"), "export default function S() { return null; }");
    await generateManifest();
    const manifest = await Bun.file(join(dir, ".borgo/routes.gen.tsx")).text();
    const staticIdx = manifest.indexOf('pattern: "/deep/static"');
    const dynamicIdx = manifest.indexOf('pattern: "/deep/:id"');
    expect(staticIdx).toBeGreaterThan(-1);
    expect(dynamicIdx).toBeGreaterThan(staticIdx);
  });
});
