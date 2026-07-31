import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// the scaffolder is a script, so it is tested the way a user runs it: spawned
// in a scratch directory, asserted on the tree it leaves behind
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
let cwd = "";

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "create-borgo-"));
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

const run = (args: string[], stdin: "pipe" | "inherit" = "pipe") => {
  const proc = Bun.spawnSync(["bun", cli, ...args], { cwd, stdin, stdout: "pipe", stderr: "pipe" });
  return {
    code: proc.exitCode,
    out: proc.stdout.toString() + proc.stderr.toString(),
  };
};

const pkg = (app: string) =>
  JSON.parse(readFileSync(join(cwd, app, "package.json"), "utf8")) as {
    name: string;
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

describe("template selection", () => {
  test("defaults to base when nothing is passed and stdin is not a tty", () => {
    expect(run(["app"]).code).toBe(0);
    // base is the only template with islands/
    expect(existsSync(join(cwd, "app", "islands"))).toBe(true);
    expect(existsSync(join(cwd, "app", "pages", "live.tsx"))).toBe(true);
  });

  for (const [template, marker] of [
    ["minimal", "pages/index.tsx"],
    ["base", "islands/Counter.tsx"],
    ["full", "pages/login.tsx"],
  ] as const) {
    test(`--template ${template} scaffolds its own shape`, () => {
      expect(run(["app", "--template", template]).code).toBe(0);
      expect(existsSync(join(cwd, "app", marker))).toBe(true);
    });
  }

  test("minimal really is minimal", () => {
    run(["app", "--template", "minimal"]);
    expect(existsSync(join(cwd, "app", "islands"))).toBe(false);
    expect(existsSync(join(cwd, "app", "pages", "about.tsx"))).toBe(false);
  });

  test("full carries the auth and realtime surface", () => {
    run(["app", "--template", "full"]);
    for (const f of ["pages/register.tsx", "pages/account.tsx", "pages/live.tsx", "api/users.go", "ws-events.d.ts"]) {
      expect(existsSync(join(cwd, "app", f))).toBe(true);
    }
  });

  test("-t and --template=x are the same flag", () => {
    expect(run(["a", "-t", "full"]).code).toBe(0);
    expect(run(["b", "--template=full"]).code).toBe(0);
    expect(existsSync(join(cwd, "a", "pages", "login.tsx"))).toBe(true);
    expect(existsSync(join(cwd, "b", "pages", "login.tsx"))).toBe(true);
  });

  test("an unknown template is refused by name", () => {
    const { code, out } = run(["app", "--template", "kitchen-sink"]);
    expect(code).toBe(1);
    expect(out).toContain("kitchen-sink");
    expect(out).toContain("minimal");
    expect(existsSync(join(cwd, "app"))).toBe(false);
  });
});

describe("tailwind", () => {
  test("off by default: scss stays, the tailwind stylesheet is removed", () => {
    run(["app"]);
    expect(existsSync(join(cwd, "app", "style.scss"))).toBe(true);
    expect(existsSync(join(cwd, "app", "style.css"))).toBe(false);
    expect(existsSync(join(cwd, "app", "tailwind.css"))).toBe(false);
    expect(pkg("app").scripts.dev).toBe("borgo dev");
    expect(pkg("app").devDependencies.tailwindcss).toBeUndefined();
  });

  for (const template of ["minimal", "base", "full"] as const) {
    test(`--tailwind wires ${template} end to end`, () => {
      expect(run(["app", "--template", template, "--tailwind"]).code).toBe(0);
      const app = join(cwd, "app");
      // the scss is replaced, not left beside a second stylesheet
      expect(existsSync(join(app, "style.scss"))).toBe(false);
      expect(existsSync(join(app, "tailwind.css"))).toBe(false);
      const css = readFileSync(join(app, "style.css"), "utf8");
      expect(css).toContain('@import "tailwindcss"');
      // the template's own look survives the switch
      expect(css.length).toBeGreaterThan(200);

      const p = pkg("app");
      expect(p.scripts.dev).toContain("--tailwind");
      expect(p.scripts.build).toContain("--tailwind");
      expect(p.scripts.start).toContain("--tailwind");
      expect(p.devDependencies.tailwindcss).toBeTruthy();
      expect(p.devDependencies["@tailwindcss/cli"]).toBeTruthy();
    });
  }

  test("--no-tailwind is explicit and does not ask", () => {
    expect(run(["app", "--no-tailwind"]).code).toBe(0);
    expect(existsSync(join(cwd, "app", "style.scss"))).toBe(true);
  });

  test("the flags compose in either order", () => {
    expect(run(["a", "--tailwind", "--template", "full"]).code).toBe(0);
    expect(run(["b", "--template", "full", "--tailwind"]).code).toBe(0);
    for (const app of ["a", "b"]) {
      expect(existsSync(join(cwd, app, "pages", "login.tsx"))).toBe(true);
      expect(existsSync(join(cwd, app, "style.css"))).toBe(true);
    }
  });
});

describe("the scaffolded tree", () => {
  test("dotfiles npm would have stripped are restored", () => {
    run(["app"]);
    expect(existsSync(join(cwd, "app", ".gitignore"))).toBe(true);
    expect(existsSync(join(cwd, "app", ".dockerignore"))).toBe(true);
    expect(existsSync(join(cwd, "app", ".borgo", "api-types.d.ts"))).toBe(true);
    // and their shipped names are gone
    expect(existsSync(join(cwd, "app", "gitignore"))).toBe(false);
    expect(existsSync(join(cwd, "app", "_borgo"))).toBe(false);
  });

  test("the app name is stamped everywhere it appears", () => {
    run(["my-notes", "--template", "full"]);
    expect(pkg("my-notes").name).toBe("my-notes");
    expect(readFileSync(join(cwd, "my-notes", "go.mod"), "utf8")).toContain("module my-notes");
    expect(readFileSync(join(cwd, "my-notes", "main.go"), "utf8")).toContain('"my-notes/api"');
    // deeper than the root: the full template names itself in its layout
    const layout = readFileSync(join(cwd, "my-notes", "pages", "_layout.tsx"), "utf8");
    expect(layout).toContain("my-notes");
    expect(layout).not.toContain("{{name}}");
  });

  test("no placeholder survives anywhere in the tree", async () => {
    run(["app", "--template", "full", "--tailwind"]);
    const glob = new Bun.Glob("**/*");
    for await (const rel of glob.scan({ cwd: join(cwd, "app"), onlyFiles: true })) {
      if (rel.endsWith(".svg")) continue;
      const text = readFileSync(join(cwd, "app", rel), "utf8");
      expect(`${rel}: ${text.includes("{{name}}") || text.includes("{{version}}")}`).toBe(
        `${rel}: false`,
      );
    }
  });

  test("the framework dependency is pinned to this scaffolder's version", () => {
    run(["app"]);
    const version = JSON.parse(
      readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ).version as string;
    expect(pkg("app").dependencies["borgo-framework"]).toBe(`^${version}`);
  });

  test("tsconfig includes the generated types explicitly", () => {
    run(["app"]);
    const tsconfig = readFileSync(join(cwd, "app", "tsconfig.json"), "utf8");
    expect(tsconfig).toContain(".borgo/api-types.d.ts");
  });
});

describe("refusals", () => {
  test("an invalid project name is rejected before anything is written", () => {
    const { code, out } = run(["Not Valid"]);
    expect(code).toBe(1);
    expect(out).toContain("invalid project name");
  });

  test("a non-empty directory is never overwritten", () => {
    mkdirSync(join(cwd, "app"));
    writeFileSync(join(cwd, "app", "keep.txt"), "mine");
    const { code, out } = run(["app"]);
    expect(code).toBe(1);
    expect(out).toContain("already exists");
    expect(readFileSync(join(cwd, "app", "keep.txt"), "utf8")).toBe("mine");
  });

  test("an unknown flag stops the run", () => {
    const { code, out } = run(["app", "--turbo"]);
    expect(code).toBe(1);
    expect(out).toContain("--turbo");
    expect(existsSync(join(cwd, "app"))).toBe(false);
  });

  test("--help explains both questions and exits 0", () => {
    const { code, out } = run(["--help"]);
    expect(code).toBe(0);
    expect(out).toContain("--template");
    expect(out).toContain("--tailwind");
    for (const t of ["minimal", "base", "full"]) expect(out).toContain(t);
  });
});

describe("what the user is told", () => {
  test("the summary names the stack it built", () => {
    const plain = run(["a", "--template", "full"]).out;
    expect(plain).toContain("created a/");
    expect(plain).toContain("full");
    expect(plain).not.toContain("tailwind");

    const tw = run(["b", "--template", "base", "--tailwind"]).out;
    expect(tw).toContain("tailwind");
    expect(tw).toContain("style.css");
  });

  test("the next steps are the commands that actually work", () => {
    const { out } = run(["app"]);
    expect(out).toContain("cd app");
    expect(out).toContain("bun install");
    expect(out).toContain("go mod tidy");
    expect(out).toContain("bun run dev");
    expect(out).toContain("http://localhost:3000");
  });

  test("the banner appears once", () => {
    const { out } = run(["app"]);
    expect(out.split("create-borgo").length - 1).toBe(1);
  });
});
