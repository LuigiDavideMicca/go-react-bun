import { describe, expect, test } from "bun:test";
import {
  checkApiBinary,
  checkApiTypes,
  checkBun,
  checkDeps,
  checkGo,
  checkNodeModules,
  checkPort,
  parseNetstatPid,
  parseVersion,
  portHolder,
  realEnv,
  versionAtLeast,
  type DoctorEnv,
} from "../src/doctor";

function fakeEnv(overrides: Partial<DoctorEnv> = {}): DoctorEnv {
  return {
    platform: "linux",
    env: {},
    which: () => "/usr/bin/tool",
    exec: () => ({ code: 0, out: "" }),
    exists: () => false,
    mtime: () => null,
    listDir: () => [],
    readFile: () => null,
    resolve: () => null,
    openForWrite: () => "ok",
    isPortFree: async () => true,
    ...overrides,
  };
}

describe("versions", () => {
  test("parseVersion", () => {
    expect(parseVersion("1.3.14")).toEqual([1, 3, 14]);
    expect(parseVersion("go1.26")).toEqual([1, 26, 0]);
    expect(parseVersion("nope")).toBeNull();
  });

  test("versionAtLeast", () => {
    expect(versionAtLeast("1.3.14", "1.3.0")).toBe(true);
    expect(versionAtLeast("1.3.0", "1.3.0")).toBe(true);
    expect(versionAtLeast("1.2.9", "1.3.0")).toBe(false);
    expect(versionAtLeast("2.0.0", "1.9.9")).toBe(true);
    expect(versionAtLeast("1.26", "1.25")).toBe(true);
    expect(versionAtLeast("garbage", "1.0.0")).toBe(false);
  });
});

describe("checkBun", () => {
  test("missing from PATH", () => {
    const r = checkBun(fakeEnv({ which: () => null }));
    expect(r.ok).toBe(false);
    expect(r.fix).toContain("bun.sh/install");
  });

  test("npm shim without bun.exe on windows", () => {
    const r = checkBun(
      fakeEnv({
        platform: "win32",
        which: (cmd) => (cmd === "bun" ? "C:\\nodejs\\bun.CMD" : null),
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("shim");
    expect(r.fix).toContain("official installer");
  });

  test("real bun.exe on windows passes", () => {
    const r = checkBun(
      fakeEnv({
        platform: "win32",
        which: () => "C:\\Users\\x\\.bun\\bin\\bun.exe",
        exec: () => ({ code: 0, out: "1.3.14\n" }),
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("1.3.14");
  });

  test("too old", () => {
    const r = checkBun(fakeEnv({ exec: () => ({ code: 0, out: "1.2.0\n" }) }));
    expect(r.ok).toBe(false);
    expect(r.fix).toBe("bun upgrade");
  });
});

describe("checkGo", () => {
  test("missing", () => {
    const r = checkGo(fakeEnv({ which: () => null }));
    expect(r.ok).toBe(false);
    expect(r.fix).toContain("go.dev/dl");
  });

  test("older than the app's go.mod requirement", () => {
    const r = checkGo(
      fakeEnv({
        exec: () => ({ code: 0, out: "go version go1.24.1 linux/amd64" }),
        readFile: (p) => (p === "go.mod" ? "module app\n\ngo 1.25.0\n" : null),
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("go1.24.1");
    expect(r.detail).toContain("1.25.0");
  });

  test("recent enough", () => {
    const r = checkGo(fakeEnv({ exec: () => ({ code: 0, out: "go version go1.26.4 windows/amd64" }) }));
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("go1.26.4");
  });
});

describe("ports", () => {
  const netstat = [
    "Active Connections",
    "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       4321",
    "  TCP    [::]:3501              [::]:0                 LISTENING       8765",
    "  TCP    127.0.0.1:9999         127.0.0.1:50000        ESTABLISHED     1111",
  ].join("\r\n");

  test("parseNetstatPid", () => {
    expect(parseNetstatPid(netstat, 3000)).toBe("4321");
    expect(parseNetstatPid(netstat, 3501)).toBe("8765");
    expect(parseNetstatPid(netstat, 9999)).toBeNull();
  });

  test("parseNetstatPid on a localized windows (italian)", () => {
    const localized = [
      "Connessioni attive",
      "  TCP    0.0.0.0:3000           0.0.0.0:0              IN ASCOLTO      4321",
      "  TCP    127.0.0.1:9999         127.0.0.1:50000        STABILITA       1111",
    ].join("\r\n");
    expect(parseNetstatPid(localized, 3000)).toBe("4321");
    expect(parseNetstatPid(localized, 9999)).toBeNull();
  });

  test("free port passes", async () => {
    const r = await checkPort(fakeEnv(), 3000, "front", "PORT");
    expect(r.ok).toBe(true);
  });

  test("busy port names the holder on windows", async () => {
    const r = await checkPort(
      fakeEnv({
        platform: "win32",
        isPortFree: async () => false,
        exec: (cmd) =>
          cmd[0] === "netstat"
            ? { code: 0, out: netstat }
            : { code: 0, out: '"api.exe","4321","Console","1","10,000 K"' },
      }),
      3000,
      "front",
      "PORT",
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("api.exe");
    expect(r.detail).toContain("4321");
    expect(r.fix).toContain("taskkill /F /PID 4321");
    expect(r.fix).toContain("PORT");
  });

  test("busy port without a known holder still suggests the env var", async () => {
    const r = await checkPort(
      fakeEnv({ isPortFree: async () => false, exec: () => ({ code: 1, out: "" }) }),
      3501,
      "api",
      "API_PORT",
    );
    expect(r.ok).toBe(false);
    expect(r.fix).toContain("API_PORT");
  });

  // the real probe, not the injected one: a holder bound to the wildcard
  // address without SO_EXCLUSIVEADDRUSE (go's net.Listen, and so borgo's own
  // api on windows) still leaves 127.0.0.1 bindable, so a loopback-pinned
  // probe would call an answering port free
  test("the real probe sees a wildcard holder that leaves loopback bindable", async () => {
    const held = Bun.serve({ port: 0, hostname: "0.0.0.0", reusePort: true, fetch: () => new Response("x") });
    try {
      expect(await realEnv().isPortFree(held.port!)).toBe(false);
    } finally {
      held.stop(true);
    }
  });

  test("the real probe calls an unheld port free", async () => {
    const probe = Bun.serve({ port: 0, fetch: () => new Response("x") });
    const port = probe.port!;
    probe.stop(true);
    expect(await realEnv().isPortFree(port)).toBe(true);
  });

  test("portHolder parses lsof output", () => {
    const out = [
      "COMMAND  PID  USER   FD   TYPE DEVICE SIZE/OFF NODE NAME",
      "api     4242 luigi   3u  IPv4 123456      0t0  TCP *:3501 (LISTEN)",
    ].join("\n");
    const holder = portHolder(fakeEnv({ exec: () => ({ code: 0, out }) }), 3501);
    expect(holder).toEqual({ pid: "4242", name: "api" });
  });
});

describe("checkApiBinary", () => {
  test("no binary is fine", () => {
    expect(checkApiBinary(fakeEnv()).ok).toBe(true);
  });

  test("locked binary fails with the kill command", () => {
    const r = checkApiBinary(
      fakeEnv({
        platform: "win32",
        exists: (p) => p === ".borgo/api.exe",
        openForWrite: () => "busy",
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.fix).toBe("taskkill /F /IM api.exe");
  });

  test("swappable binary passes", () => {
    const r = checkApiBinary(fakeEnv({ exists: (p) => p === ".borgo/api" }));
    expect(r.ok).toBe(true);
  });

  test("a running binary off windows still passes (ETXTBSY is not a lock)", () => {
    const r = checkApiBinary(
      fakeEnv({ exists: (p) => p === ".borgo/api", openForWrite: () => "busy" }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("checkApiTypes", () => {
  test("skipped without an api dir", () => {
    expect(checkApiTypes(fakeEnv())).toBeNull();
  });

  test("missing types file fails", () => {
    const r = checkApiTypes(fakeEnv({ exists: (p) => p === "api" }));
    expect(r!.ok).toBe(false);
    expect(r!.fix).toContain("go tool borgogen");
  });

  test("stale types fail naming the newer file", () => {
    const r = checkApiTypes(
      fakeEnv({
        exists: (p) => p === "api",
        listDir: () => ["tasks.go", "notes.txt"],
        mtime: (p) => (p === ".borgo/api-types.d.ts" ? 1000 : 500_000),
      }),
    );
    expect(r!.ok).toBe(false);
    expect(r!.detail).toContain("api/tasks.go");
  });

  test("fresh types pass", () => {
    const r = checkApiTypes(
      fakeEnv({
        exists: (p) => p === "api",
        listDir: () => ["tasks.go"],
        mtime: (p) => (p === ".borgo/api-types.d.ts" ? 500_000 : 1000),
      }),
    );
    expect(r!.ok).toBe(true);
  });
});

describe("project checks", () => {
  test("skipped outside an app", () => {
    expect(checkNodeModules(fakeEnv())).toBeNull();
    expect(checkDeps(fakeEnv())).toBeNull();
  });

  test("missing node_modules fails with bun install", () => {
    const r = checkNodeModules(fakeEnv({ exists: (p) => p === "package.json" }));
    expect(r!.ok).toBe(false);
    expect(r!.fix).toBe("bun install");
  });

  const appFs = (files: Record<string, string>) =>
    fakeEnv({
      exists: (p) => ["package.json", "node_modules", "api"].includes(p),
      resolve: (spec) => (files[spec] !== undefined ? spec : null),
      readFile: (p) => files[p] ?? null,
    });

  test("react/react-dom version mismatch fails", () => {
    const r = checkDeps(
      appFs({
        "borgo-framework/package.json": '{"version":"0.10.1"}',
        "react/package.json": '{"version":"19.2.0"}',
        "react-dom/package.json": '{"version":"19.1.0"}',
        "go.mod": "tool github.com/LuigiDavideMicca/borgo/cmd/borgogen",
      }),
    );
    expect(r!.ok).toBe(false);
    expect(r!.detail).toContain("differ");
  });

  test("missing tool directive fails", () => {
    const r = checkDeps(
      appFs({
        "borgo-framework/package.json": '{"version":"0.10.1"}',
        "react/package.json": '{"version":"19.2.0"}',
        "react-dom/package.json": '{"version":"19.2.0"}',
        "go.mod": "module app\n\ngo 1.25.0\n",
      }),
    );
    expect(r!.ok).toBe(false);
    expect(r!.fix).toContain("tool github.com/LuigiDavideMicca/borgo/cmd/borgogen");
  });

  test("sane deps pass", () => {
    const r = checkDeps(
      appFs({
        "borgo-framework/package.json": '{"version":"0.10.1"}',
        "react/package.json": '{"version":"19.2.0"}',
        "react-dom/package.json": '{"version":"19.2.0"}',
        "go.mod": "module app\n\ngo 1.25.0\n\ntool github.com/LuigiDavideMicca/borgo/cmd/borgogen\n",
      }),
    );
    expect(r!.ok).toBe(true);
    expect(r!.detail).toContain("borgo-framework 0.10.1");
  });
});
