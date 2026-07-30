// borgo doctor: diagnoses the environment an app runs in. every check is a
// pure function over an injectable DoctorEnv, so the logic is unit-testable
// without touching the real machine.
import { closeSync, existsSync, openSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { banner, c, g } from "./colors";

export type Check = { name: string; ok: boolean; detail: string; fix?: string };

export type DoctorEnv = {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  which: (cmd: string) => string | null;
  exec: (cmd: string[]) => { code: number; out: string };
  exists: (path: string) => boolean;
  mtime: (path: string) => number | null;
  listDir: (dir: string) => string[];
  readFile: (path: string) => string | null;
  resolve: (spec: string) => string | null;
  openForWrite: (path: string) => "ok" | "busy";
  isPortFree: (port: number) => Promise<boolean>;
};

export const realEnv = (): DoctorEnv => ({
  platform: process.platform,
  env: process.env,
  which: (cmd) => Bun.which(cmd),
  exec: (cmd) => {
    try {
      const proc = Bun.spawnSync({ cmd, stdout: "pipe", stderr: "pipe" });
      return { code: proc.exitCode ?? 1, out: proc.stdout.toString() };
    } catch {
      return { code: 1, out: "" };
    }
  },
  exists: existsSync,
  mtime: (path) => {
    try {
      return statSync(path).mtimeMs;
    } catch {
      return null;
    }
  },
  listDir: (dir) => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  },
  readFile: (path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
  resolve: (spec) => {
    try {
      return Bun.resolveSync(spec, process.cwd());
    } catch {
      return null;
    }
  },
  // a running executable cannot be opened for write on windows; that is
  // exactly the lock that makes dev's binary swap fail with EPERM
  openForWrite: (path) => {
    try {
      closeSync(openSync(path, "r+"));
      return "ok";
    } catch (error) {
      return (error as { code?: string }).code === "ENOENT" ? "ok" : "busy";
    }
  },
  isPortFree: (port) =>
    new Promise((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.listen({ port, host: "127.0.0.1", exclusive: true }, () =>
        server.close(() => resolve(true)),
      );
    }),
});

export function parseVersion(s: string): number[] | null {
  const m = s.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}

export function versionAtLeast(version: string, min: string): boolean {
  const a = parseVersion(version);
  const b = parseVersion(min);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

const MIN_BUN = "1.3.0";
const MIN_GO = "1.25";

const bunInstall = (platform: string) =>
  platform === "win32"
    ? 'powershell -c "irm bun.sh/install.ps1 | iex"'
    : "curl -fsSL https://bun.sh/install | bash";

export function checkBun(d: DoctorEnv): Check {
  const name = "bun";
  const found = d.which("bun");
  if (!found) {
    return { name, ok: false, detail: "not found on PATH", fix: `install it: ${bunInstall(d.platform)}` };
  }
  // the npm-installed bun is a shim script: it runs, but the bin shims it
  // spawns look for bun.exe on PATH and fail with "bun is not installed"
  if (d.platform === "win32" && !d.which("bun.exe")) {
    return {
      name,
      ok: false,
      detail: `resolves to a shim (${found}) but bun.exe is not on PATH`,
      fix: `use the official installer instead of npm: ${bunInstall(d.platform)}`,
    };
  }
  const ver = d.exec(["bun", "--version"]);
  const version = ver.code === 0 ? ver.out.trim() : "";
  if (!version) {
    return { name, ok: false, detail: `${found} did not answer --version`, fix: `reinstall it: ${bunInstall(d.platform)}` };
  }
  if (!versionAtLeast(version, MIN_BUN)) {
    return { name, ok: false, detail: `${version} is older than the required ${MIN_BUN}`, fix: "bun upgrade" };
  }
  return { name, ok: true, detail: `${version} ${g.dot} ${found}` };
}

export function checkGo(d: DoctorEnv): Check {
  const name = "go";
  const found = d.which("go");
  const required = d.readFile("go.mod")?.match(/^go\s+(\d+(?:\.\d+){0,2})/m)?.[1] ?? MIN_GO;
  if (!found) {
    return { name, ok: false, detail: "not found on PATH", fix: `install go >= ${required}: https://go.dev/dl` };
  }
  const ver = d.exec(["go", "version"]);
  const version = ver.code === 0 ? ver.out.match(/go(\d+\.\d+(?:\.\d+)?)/)?.[1] : undefined;
  if (!version) {
    return { name, ok: false, detail: `${found} did not answer \`go version\``, fix: `reinstall go: https://go.dev/dl` };
  }
  if (!versionAtLeast(version, required)) {
    return { name, ok: false, detail: `go${version} is older than the required go >= ${required}`, fix: "update go: https://go.dev/dl" };
  }
  return { name, ok: true, detail: `go${version} ${g.dot} ${found}` };
}

export function parseNetstatPid(out: string, port: number): string | null {
  for (const line of out.split("\n")) {
    if (!/LISTENING/i.test(line)) continue;
    const m = line.match(/^\s*TCP\s+\S+:(\d+)\s/);
    if (!m || Number(m[1]) !== port) continue;
    const pid = line.trim().split(/\s+/).pop();
    if (pid && /^\d+$/.test(pid)) return pid;
  }
  return null;
}

export function portHolder(d: DoctorEnv, port: number): { pid: string; name: string } | null {
  if (d.platform === "win32") {
    const pid = parseNetstatPid(d.exec(["netstat", "-ano", "-p", "tcp"]).out, port);
    if (!pid) return null;
    const task = d.exec(["tasklist", "/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
    return { pid, name: task.out.match(/^"([^"]+)"/)?.[1] ?? "unknown" };
  }
  const out = d.exec(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]).out;
  const line = out.split("\n").find((l) => /LISTEN/.test(l));
  if (!line) return null;
  const [name, pid] = line.trim().split(/\s+/);
  return pid && /^\d+$/.test(pid) ? { pid, name } : null;
}

export async function checkPort(d: DoctorEnv, port: number, label: string, envVar: string): Promise<Check> {
  const name = `port ${port} (${label})`;
  if (await d.isPortFree(port)) return { name, ok: true, detail: "free" };
  const holder = portHolder(d, port);
  if (!holder) {
    return { name, ok: false, detail: "in use", fix: `free it, or set ${envVar} to another port` };
  }
  const kill = d.platform === "win32" ? `taskkill /F /PID ${holder.pid}` : `kill ${holder.pid}`;
  return {
    name,
    ok: false,
    detail: `in use by ${holder.name} (pid ${holder.pid})`,
    fix: `${kill} ${g.dot} or set ${envVar} to another port`,
  };
}

export function checkApiBinary(d: DoctorEnv): Check {
  const name = "api binary";
  const image = "api" + (d.platform === "win32" ? ".exe" : "");
  const bin = `.borgo/${image}`;
  if (!d.exists(bin)) return { name, ok: true, detail: "no dev binary yet" };
  if (d.openForWrite(bin) === "busy") {
    const kill = d.platform === "win32" ? `taskkill /F /IM ${image}` : "pkill -x api";
    return {
      name,
      ok: false,
      detail: `${bin} is locked by a running "api" process, dev cannot swap in a new build`,
      fix: kill,
    };
  }
  return { name, ok: true, detail: `${bin} swappable` };
}

export function checkApiTypes(d: DoctorEnv): Check | null {
  if (!d.exists("api")) return null;
  const name = "api types";
  const types = ".borgo/api-types.d.ts";
  const fix = "go tool borgogen (borgo dev and borgo build run it for you)";
  const generated = d.mtime(types);
  if (generated === null) return { name, ok: false, detail: `${types} is missing`, fix };
  for (const file of d.listDir("api")) {
    if (!file.endsWith(".go")) continue;
    const changed = d.mtime(`api/${file}`);
    if (changed !== null && changed > generated + 1000) {
      return { name, ok: false, detail: `api/${file} is newer than ${types}`, fix };
    }
  }
  return { name, ok: true, detail: "fresh" };
}

export function checkNodeModules(d: DoctorEnv): Check | null {
  if (!d.exists("package.json")) return null;
  const name = "node_modules";
  if (!d.exists("node_modules")) return { name, ok: false, detail: "missing", fix: "bun install" };
  return { name, ok: true, detail: "present" };
}

const pkgVersion = (d: DoctorEnv, path: string | null): string | null => {
  if (!path) return null;
  const raw = d.readFile(path);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
};

export function checkDeps(d: DoctorEnv): Check | null {
  if (!d.exists("package.json") || !d.exists("node_modules")) return null;
  const name = "app deps";
  const framework = pkgVersion(d, d.resolve("borgo-framework/package.json"));
  if (!framework) {
    return { name, ok: false, detail: "borgo-framework is not installed", fix: "bun install" };
  }
  const react = pkgVersion(d, d.resolve("react/package.json"));
  const reactDom = pkgVersion(d, d.resolve("react-dom/package.json"));
  if (!react || !reactDom) {
    return { name, ok: false, detail: "react and react-dom must both be installed", fix: "bun install" };
  }
  if (react !== reactDom) {
    return {
      name,
      ok: false,
      detail: `react ${react} and react-dom ${reactDom} differ`,
      fix: "align their versions in package.json, then bun install",
    };
  }
  if (d.exists("api") && !/cmd\/borgogen/.test(d.readFile("go.mod") ?? "")) {
    return {
      name,
      ok: false,
      detail: "go.mod is missing the borgogen tool directive",
      fix: "add `tool github.com/LuigiDavideMicca/borgo/cmd/borgogen` to go.mod",
    };
  }
  return { name, ok: true, detail: `borgo-framework ${framework}, react ${react}` };
}

export async function runChecks(d: DoctorEnv): Promise<Check[]> {
  const port = Number(d.env.PORT || 3000);
  const apiPort = Number(d.env.API_PORT || 3501);
  const results: Array<Check | null> = [
    checkBun(d),
    checkGo(d),
    await checkPort(d, port, "front", "PORT"),
    await checkPort(d, apiPort, "api", "API_PORT"),
    checkApiBinary(d),
    checkApiTypes(d),
    checkNodeModules(d),
    checkDeps(d),
  ];
  return results.filter((r): r is Check => r !== null);
}

export async function doctor(d: DoctorEnv = realEnv()): Promise<number> {
  console.log(`\n  ${banner("doctor")}\n`);
  const results = await runChecks(d);
  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const mark = r.ok ? c.sage(g.ok) : c.red(g.err);
    const detail = r.ok ? c.dim(r.detail) : r.detail;
    console.log(`  ${mark} ${r.name.padEnd(width)}  ${detail}`);
    if (!r.ok && r.fix) console.log(`    ${c.terracotta(g.arrow)} ${r.fix}`);
  }
  if (!d.exists("package.json")) {
    console.log(`\n  ${c.dim("not inside a borgo app, project checks skipped")}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    failed
      ? `\n  ${c.red(g.err)} ${failed} of ${results.length} checks failed\n`
      : `\n  ${c.sage(g.ok)} all ${results.length} checks passed\n`,
  );
  return failed ? 1 : 0;
}
