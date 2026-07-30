import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { caddyfile, composeYml, deployInit, nginxConf, projectContext, systemdUnit } from "../src/deploy";

const ctx = { name: "my-app", port: "3000", apiPort: "3501" };

const balanced = (s: string) => s.split("{").length === s.split("}").length;

describe("templates", () => {
  test("caddyfile proxies the front port with balanced braces", () => {
    const out = caddyfile(ctx);
    expect(out).toContain("reverse_proxy localhost:3000");
    expect(out).toContain("my-app");
    expect(balanced(out)).toBe(true);
  });

  test("nginx conf keeps websockets and sse working", () => {
    const out = nginxConf(ctx);
    expect(out).toContain("proxy_pass http://localhost:3000;");
    expect(out).toContain("proxy_set_header Upgrade $http_upgrade;");
    expect(out).toContain('proxy_set_header Connection "upgrade";');
    expect(out).toContain("proxy_buffering off;");
    expect(balanced(out)).toBe(true);
    // every directive inside a block ends with a semicolon
    for (const line of out.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || t.endsWith("{") || t === "}") continue;
      expect(t.endsWith(";")).toBe(true);
    }
  });

  test("systemd unit carries the paths and env", () => {
    const out = systemdUnit(ctx);
    expect(out).toContain("[Unit]");
    expect(out).toContain("[Service]");
    expect(out).toContain("[Install]");
    expect(out).toContain("WorkingDirectory=/srv/my-app");
    expect(out).toContain("Environment=PORT=3000");
    expect(out).toContain("Environment=API_PORT=3501");
    expect(out).toContain("ExecStart=/usr/local/bin/bun run start");
  });

  test("compose maps the templated port and the data volume", () => {
    const out = composeYml({ ...ctx, port: "8080" });
    expect(out).toContain('- "8080:8080"');
    expect(out).toContain('PORT: "8080"');
    expect(out).toContain("- data:/data");
    expect(out).toContain("restart: unless-stopped");
  });
});

describe("projectContext", () => {
  test("reads and sanitizes the package name", () => {
    const dir = mkdtempSync(join(tmpdir(), "borgo-deploy-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@scope/My App!" }));
    expect(projectContext(dir).name).toBe("scope-My-App");
  });

  test("falls back without a package.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "borgo-deploy-"));
    expect(projectContext(dir).name).toBe("borgo-app");
  });
});

describe("deployInit", () => {
  test("writes the target file and reports it", () => {
    const dir = mkdtempSync(join(tmpdir(), "borgo-deploy-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "demo" }));
    expect(deployInit("caddy", false, dir)).toBe(0);
    const written = readFileSync(join(dir, "Caddyfile"), "utf8");
    expect(written).toContain("reverse_proxy localhost:3000");
  });

  test("refuses to overwrite without --force", () => {
    const dir = mkdtempSync(join(tmpdir(), "borgo-deploy-"));
    writeFileSync(join(dir, "Caddyfile"), "mine");
    expect(deployInit("caddy", false, dir)).toBe(1);
    expect(readFileSync(join(dir, "Caddyfile"), "utf8")).toBe("mine");
    expect(deployInit("caddy", true, dir)).toBe(0);
    expect(readFileSync(join(dir, "Caddyfile"), "utf8")).toContain("reverse_proxy");
  });

  test("unknown or missing targets fail with usage", () => {
    const dir = mkdtempSync(join(tmpdir(), "borgo-deploy-"));
    expect(deployInit("k8s", false, dir)).toBe(1);
    expect(deployInit(undefined, false, dir)).toBe(1);
    expect(existsSync(join(dir, "Caddyfile"))).toBe(false);
  });

  test("every target writes its file", () => {
    const dir = mkdtempSync(join(tmpdir(), "borgo-deploy-"));
    for (const [target, file] of [
      ["caddy", "Caddyfile"],
      ["nginx", "site.conf"],
      ["systemd", "borgo.service"],
      ["compose", "docker-compose.yml"],
    ] as const) {
      expect(deployInit(target, false, dir)).toBe(0);
      expect(existsSync(join(dir, file))).toBe(true);
    }
  });
});
