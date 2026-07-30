#!/usr/bin/env bun
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const colors = !process.env.NO_COLOR && process.stdout.isTTY === true;
const wrap = (code: string) => (s: string) => (colors ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = wrap("1");
const dim = wrap("2");
const terracotta = wrap("38;5;173");
const sage = wrap("38;5;108");

// on windows, utf-8 marks survive only a real console in codepage 65001
const unicode = await (async () => {
  if (process.platform !== "win32") return true;
  if (process.stdout.isTTY !== true) return false;
  try {
    const { dlopen, FFIType } = await import("bun:ffi");
    const kernel32 = dlopen("kernel32.dll", {
      GetConsoleOutputCP: { args: [], returns: FFIType.u32 },
    });
    return kernel32.symbols.GetConsoleOutputCP() === 65001;
  } catch {
    return false;
  }
})();
const home = unicode ? "⌂" : "^";
const ok = unicode ? "✓" : "+";
const dot = unicode ? "·" : "-";

const version = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
).version as string;

const TEMPLATES = [
  { name: "base", hint: "the tour: loaders, actions, realtime, islands (default)" },
  { name: "minimal", hint: "bare bones: one page, one go route" },
  { name: "full", hint: "auth + crud: sessions, csrf, protected pages, typed ws" },
] as const;
type TemplateName = (typeof TEMPLATES)[number]["name"];

let name: string | undefined;
let template: string | undefined;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--template" || arg === "-t") template = args[++i];
  else if (arg.startsWith("--template=")) template = arg.slice("--template=".length);
  else if (arg === "--help" || arg === "-h") {
    console.log(`
  usage: bunx create-borgo <name> [--template base|minimal|full]

  templates
${TEMPLATES.map((t) => `    ${t.name.padEnd(8)} ${t.hint}`).join("\n")}

  without --template, an interactive terminal asks; anywhere else (CI,
  piped stdin) the default is "base".
`);
    process.exit(0);
  } else if (!arg.startsWith("-") && !name) name = arg;
  else {
    console.error(`unknown argument "${arg}" - see create-borgo --help`);
    process.exit(1);
  }
}

name ??= "borgo-app";

if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
  console.error(`invalid project name "${name}": use lowercase letters, digits, ".", "_" and "-"`);
  process.exit(1);
}

const isTemplate = (t: string): t is TemplateName => TEMPLATES.some((k) => k.name === t);

if (template === undefined) {
  if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
    console.log(`\n  ${terracotta(home)} ${bold("create-borgo")} ${dim(`v${version}`)}\n`);
    TEMPLATES.forEach((t, i) => {
      console.log(`  ${bold(String(i + 1))} ${t.name.padEnd(8)} ${dim(t.hint)}`);
    });
    process.stdout.write(`\n  template ${dim("(1-3, enter = base)")}: `);
    for await (const line of console) {
      const answer = line.trim().toLowerCase();
      if (answer === "") template = "base";
      else if (/^[1-9]$/.test(answer)) template = TEMPLATES[Number(answer) - 1]?.name;
      else if (isTemplate(answer)) template = answer;
      if (template === undefined) {
        process.stdout.write(`  pick 1-${TEMPLATES.length} ${dim("(enter = base)")}: `);
        continue;
      }
      break;
    }
    template ??= "base";
  } else {
    template = "base";
  }
}

if (!isTemplate(template)) {
  console.error(
    `unknown template "${template}" - available: ${TEMPLATES.map((t) => t.name).join(", ")}`,
  );
  process.exit(1);
}

const target = join(process.cwd(), name);
if (existsSync(target) && readdirSync(target).length > 0) {
  console.error(`directory "${name}" already exists and is not empty`);
  process.exit(1);
}

const source = fileURLToPath(new URL(`../templates/${template}`, import.meta.url));
cpSync(source, target, { recursive: true });

// npm strips dotfiles from published packages, so the templates ship them unprefixed
renameSync(join(target, "gitignore"), join(target, ".gitignore"));
renameSync(join(target, "dockerignore"), join(target, ".dockerignore"));
// pregenerated api types, so the api client is typed before the first `dev` run
renameSync(join(target, "_borgo"), join(target, ".borgo"));

// stamp {{name}} and {{version}} across the whole scaffold
const stamp = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      stamp(path);
      continue;
    }
    const text = readFileSync(path, "utf8");
    if (!text.includes("{{name}}") && !text.includes("{{version}}")) continue;
    writeFileSync(
      path,
      text.replaceAll("{{name}}", name).replaceAll("{{version}}", `^${version}`),
    );
  }
};
stamp(target);

const layouts: Record<TemplateName, string> = {
  minimal: `    pages/      ${dim("react pages, file name = route")}
    api/        ${dim("go api routes, mounted via //borgo:route directives")}
    main.go     ${dim("go entrypoint: import api, borgo.Serve()")}
    index.html  ${dim("html shell")} ${dot} style.scss ${dim("global styles")}`,
  base: `    pages/      ${dim("react pages: loader, form action, hydrate=false, sse")}
    islands/    ${dim("components that hydrate alone inside zero-js pages")}
    api/        ${dim("go api routes, mounted via //borgo:route directives")}
    main.go     ${dim("go entrypoint: import api, borgo.Serve()")}
    index.html  ${dim("html shell")} ${dot} style.scss ${dim("global styles")}`,
  full: `    pages/      ${dim("notes crud, login/register, protected account, live ws")}
    api/        ${dim("go: notes + auth (in-memory stores, swap for a real db)")}
    main.go     ${dim("go entrypoint: import api, borgo.Serve()")}
    index.html  ${dim("html shell")} ${dot} style.scss ${dim("global styles")}`,
};

console.log(`
  ${terracotta(home)} ${bold("create-borgo")} ${dim(`v${version}`)}

  ${sage(ok)} created ${bold(name)}/ ${dim(`(template: ${template})`)}
${layouts[template]}

  next steps
    cd ${name}
    bun install
    go mod tidy
    bun run dev

  then open ${bold("http://localhost:3000")}

  ${dim(`borgo is built by Luigi Micca ${dot}`)} ${terracotta("https://luigimicca.com")}
`);
