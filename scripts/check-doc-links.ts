// verifies the docs mechanically: every internal link (markdown, html
// href/src, bare docs/*.md mention) points at a file that exists with the
// anchors it names, and every ts/tsx fenced block typechecks against the
// example app's tsconfig and generated types. blocks marked `no-check` in
// the fence info string are intentionally partial and skipped. no deps.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const repoBlob = "https://github.com/LuigiDavideMicca/borgo/blob/main/";
const sources = [
  "README.md",
  ...readdirSync("docs")
    .filter((f) => f.endsWith(".md"))
    .map((f) => `docs/${f}`),
  "packages/borgo/README.md",
  "packages/create-borgo/template/README.md",
];

const slug = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[`*]/g, "")
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .trim()
    .replace(/ /g, "-");

const anchorsOf = (file: string) => {
  const anchors = new Set<string>();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^#{1,6}\s+(.*)$/);
    if (m) anchors.add(slug(m[1]));
  }
  return anchors;
};

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  x ${msg}`);
};

const stripFences = (text: string) => text.replace(/```[\s\S]*?```/g, "");

const checkTarget = (source: string, raw: string) => {
  let target = raw;
  if (target.startsWith(repoBlob)) target = resolve(target.slice(repoBlob.length));
  else if (/^[a-z]+:/i.test(target)) return;

  const [path, anchor] = target.split("#");
  const file = path === "" ? resolve(source) : path.startsWith("/") || /^[A-Za-z]:/.test(path) ? path : join(dirname(source), path);
  if (!existsSync(file)) {
    fail(`${source}: broken link ${raw}`);
    return;
  }
  if (anchor && file.endsWith(".md") && !anchorsOf(file).has(anchor)) {
    fail(`${source}: missing anchor #${anchor} in ${raw}`);
  }
};

for (const source of sources) {
  if (!existsSync(source)) {
    fail(`${source}: file listed for checking does not exist`);
    continue;
  }
  const raw = readFileSync(source, "utf8");
  // code spans and fenced blocks are not links: borgo.Bind[T](r) is code
  const text = stripFences(raw).replace(/`[^`\n]*`/g, "");
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) checkTarget(source, m[1]);
  // html rides in markdown too: <a href>, <img src>
  for (const m of text.matchAll(/<[a-z][^>]*\s(?:href|src)="([^"]+)"/g)) checkTarget(source, m[1]);
  // bare prose mentions like `docs/realtime.md` are root-relative promises
  for (const m of stripFences(raw).matchAll(/(?<![\w/.([])docs\/[\w.-]+\.md/g)) {
    if (!existsSync(m[0])) fail(`${source}: mentions ${m[0]}, which does not exist`);
  }
}

// ts/tsx snippets become one module each in a scratch dir inside the example
// app, so "borgo-framework" and "../.borgo/api-types" resolve exactly as they
// do from a real pages/ file, and one tsc pass checks them all
const appDir = "examples/tasks";
const scratch = join(appDir, ".doc-snippets");
type Snippet = { file: string; source: string; fenceLine: number };
const snippets: Snippet[] = [];

rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });

for (const source of sources) {
  if (!existsSync(source)) continue;
  const lines = readFileSync(source, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^```(ts|tsx|typescript)\b(.*)$/);
    if (!fence) continue;
    const start = i;
    const body: string[] = [];
    while (++i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i]);
    if (fence[2].includes("no-check")) continue;
    const ext = fence[1] === "tsx" ? "tsx" : "ts";
    const file = `snippet-${snippets.length}.${ext}`;
    // a block without imports or exports must still be a module, not a
    // global script: snippets cannot collide, augmentations must augment
    const isModule = body.some((l) => /^(import|export)[\s{]/.test(l));
    writeFileSync(join(scratch, file), body.join("\n") + (isModule ? "\n" : "\nexport {};\n"));
    snippets.push({ file, source, fenceLine: start + 1 });
  }
}

if (snippets.length) {
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify(
      { extends: "../tsconfig.json", include: ["./**/*", "../.borgo/api-types.d.ts", "../ws-events.d.ts"] },
      null,
      2,
    ),
  );
  const tsc = Bun.spawnSync(["bunx", "tsc", "--noEmit", "-p", ".doc-snippets"], {
    cwd: appDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (tsc.exitCode !== 0) {
    const out = tsc.stdout.toString() + tsc.stderr.toString();
    const before = failures;
    for (const line of out.split(/\r?\n/)) {
      // .doc-snippets/snippet-3.tsx(12,5): error ... -> doc file and line
      const m = line.match(/snippet-(\d+)\.tsx?\((\d+),(\d+)\)(.*)$/);
      if (!m) continue;
      const s = snippets[Number(m[1])];
      fail(`${s.source}:${s.fenceLine + Number(m[2])}${m[4]}`);
    }
    if (failures === before) fail(`snippet typecheck failed:\n${out}`);
  } else {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (failures) {
  console.error(`\n${failures} doc problem(s)`);
  process.exit(1);
}
console.log(`docs ok (${sources.length} files, ${snippets.length} snippets typechecked)`);
