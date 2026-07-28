#!/usr/bin/env bun
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

// npm strips .gitignore from published packages, so the template ships it unprefixed
renameSync(join(target, "gitignore"), join(target, ".gitignore"));

for (const file of ["package.json", "go.mod", "main.go", "README.md"]) {
  const path = join(target, file);
  writeFileSync(path, readFileSync(path, "utf8").replaceAll("{{name}}", name));
}

console.log(`created ${name}/

next steps:
  cd ${name}
  bun install
  go mod tidy
  bun run dev

then open http://localhost:3000`);
