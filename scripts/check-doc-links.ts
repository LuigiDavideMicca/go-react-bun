// verifies that every internal markdown link in the readmes and docs points
// at a file that exists, and that #anchors match a real heading. no deps.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const repoBlob = "https://github.com/LuigiDavideMicca/borgo/blob/main/";
const sources = [
  "README.md",
  "docs/README.md",
  "docs/pages-and-routing.md",
  "docs/typed-bridge.md",
  "docs/client-navigation.md",
  "docs/realtime.md",
  "docs/auth-and-sessions.md",
  "docs/dev-experience.md",
  "docs/deploy.md",
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
  for (const line of readFileSync(file, "utf8").split("\n")) {
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

for (const source of sources) {
  if (!existsSync(source)) {
    fail(`${source}: file listed for checking does not exist`);
    continue;
  }
  // code spans and fenced blocks are not links: borgo.Bind[T](r) is code
  const text = readFileSync(source, "utf8")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    let target = m[1];
    if (target.startsWith(repoBlob)) target = resolve(target.slice(repoBlob.length));
    else if (/^[a-z]+:/i.test(target)) continue;

    const [path, anchor] = target.split("#");
    const file = path === "" ? resolve(source) : path.startsWith("/") || /^[A-Za-z]:/.test(path) ? path : join(dirname(source), path);
    if (!existsSync(file)) {
      fail(`${source}: broken link ${m[1]}`);
      continue;
    }
    if (anchor && file.endsWith(".md") && !anchorsOf(file).has(anchor)) {
      fail(`${source}: missing anchor #${anchor} in ${m[1]}`);
    }
  }
}

if (failures) {
  console.error(`\n${failures} broken doc link(s)`);
  process.exit(1);
}
console.log(`doc links ok (${sources.length} files)`);
