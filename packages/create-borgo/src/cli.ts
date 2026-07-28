#!/usr/bin/env bun
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const colors = !process.env.NO_COLOR && process.stdout.isTTY === true;
const wrap = (code: string) => (s: string) => (colors ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = wrap("1");
const dim = wrap("2");
const terracotta = wrap("38;5;173");
const sage = wrap("38;5;108");

const version = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
).version as string;

const name = process.argv[2] ?? "borgo-app";

if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
  console.error(`invalid project name "${name}": use lowercase letters, digits, ".", "_" and "-"`);
  process.exit(1);
}

const target = join(process.cwd(), name);
if (existsSync(target) && readdirSync(target).length > 0) {
  console.error(`directory "${name}" already exists and is not empty`);
  process.exit(1);
}

const template = fileURLToPath(new URL("../template", import.meta.url));
cpSync(template, target, { recursive: true });

// npm strips dotfiles from published packages, so the template ships them unprefixed
renameSync(join(target, "gitignore"), join(target, ".gitignore"));
renameSync(join(target, "dockerignore"), join(target, ".dockerignore"));

for (const file of ["package.json", "go.mod", "main.go", "README.md"]) {
  const path = join(target, file);
  writeFileSync(path, readFileSync(path, "utf8").replaceAll("{{name}}", name));
}

console.log(`
  ${terracotta("⌂")} ${bold("create-borgo")} ${dim(`v${version}`)}

  ${sage("✓")} created ${bold(name)}/
    pages/      ${dim("react pages, file name = route")}
    api/        ${dim("go api routes, mounted via //borgo:route directives")}
    main.go     ${dim("go entrypoint: import api, borgo.Serve()")}
    index.html  ${dim("html shell")} · style.scss ${dim("global styles")}

  next steps
    cd ${name}
    bun install
    go mod tidy
    bun run dev

  then open ${bold("http://localhost:3000")}

  ${dim("borgo is built by Luigi Micca ·")} ${terracotta("https://luigimicca.com")}
`);
