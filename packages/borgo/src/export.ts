// borgo export: prerenders every statically exportable route into a plain
// dist/site/ of html files + assets, servable by any static file server.
// exportable means: no loader, or `export const prerender = true` (the loader
// runs once now, against a temporary api process); dynamic-param routes need
// `export const prerenderPaths` returning the param sets.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { makeApiClient } from "./api";
import { buildAssets } from "./build";
import { banner, c, fmtMs, g } from "./colors";
import type { Route } from "./router";
import { goBinName, runBorgogen } from "./util";

type ExportModule = Route["module"];

export type ExportPlan = {
  plans: Array<{ route: Route; dynamic: boolean }>;
  skipped: Array<{ pattern: string; reason: string }>;
  needApi: boolean;
  export404: boolean;
};

// pure partition of the route table, unit-testable without a build. a _404
// page exports as 404.html even when no regular page is exportable
export function planExport(routes: Route[], notFound: Route | null = null): ExportPlan {
  const plan: ExportPlan = { plans: [], skipped: [], needApi: false, export404: false };
  for (const route of routes) {
    const module = route.module as ExportModule;
    const dynamic = route.pattern.includes(":");
    if (module.loader && module.prerender !== true) {
      plan.skipped.push({ pattern: route.pattern, reason: "has a loader without `export const prerender = true`" });
      continue;
    }
    if (dynamic && typeof module.prerenderPaths !== "function") {
      plan.skipped.push({ pattern: route.pattern, reason: "dynamic params without `export const prerenderPaths`" });
      continue;
    }
    if (module.loader || module.prerenderPaths) plan.needApi = true;
    plan.plans.push({ route, dynamic });
  }
  const notFoundModule = notFound?.module as ExportModule | undefined;
  if (notFoundModule) {
    plan.export404 = !notFoundModule.loader || notFoundModule.prerender === true;
    if (!plan.export404) {
      plan.skipped.push({ pattern: "404", reason: "has a loader without `export const prerender = true`" });
    } else if (notFoundModule.loader) {
      plan.needApi = true;
    }
  }
  return plan;
}

export function fillPattern(pattern: string, params: Record<string, string | number>): string {
  return pattern.replace(/:(\w+)/g, (_, name) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`prerenderPaths for ${pattern}: missing param "${name}"`);
    }
    return encodeURIComponent(String(value));
  });
}

// "/" -> index.html, "/about" -> about/index.html: the directory style every
// static server resolves without configuration
export function outputPath(path: string): string {
  if (path === "/") return "index.html";
  return `${path.replace(/^\/+/, "").replace(/\/+$/, "")}/index.html`;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ port: 0, host: "127.0.0.1" }, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

// a file plus its .gz/.br siblings is one asset; an orphan .gz/.br with no
// base file next to it counts as an asset in its own right
export function countAssets(dir: string): { assets: number; precompressed: number } {
  let assets = 0;
  let precompressed = 0;
  const files = new Set<string>();
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) files.add(join(entry.parentPath, entry.name));
  }
  for (const file of files) {
    const m = file.match(/\.(gz|br)$/);
    if (m && files.has(file.slice(0, -m[0].length))) precompressed++;
    else assets++;
  }
  return { assets, precompressed };
}

export function exportSummary(pages: number, wrote404: boolean, assets: number, precompressed: number): string {
  const parts = [`${pages} pages`, ...(wrote404 ? ["404.html"] : []), `${assets} assets`];
  const variants = precompressed ? ` (with ${precompressed} precompressed variants)` : "";
  return `exported ${parts.join(" + ")}${variants}`;
}

export async function exportSite(): Promise<number> {
  const t0 = performance.now();
  console.log(`\n  ${banner("export")}\n`);

  if (!(await runBorgogen())) return 1;
  await buildAssets(false);

  const manifest = pathToFileURL(join(process.cwd(), ".borgo/routes.gen.tsx")).href;
  const { routes, notFound } = (await import(manifest)) as {
    routes: Route[];
    notFound: Route | null;
  };
  const { plans, skipped, needApi, export404 } = planExport(routes, notFound);

  if (plans.length === 0 && !export404) {
    for (const s of skipped) {
      console.log(`  ${c.dim(g.dot)} ${s.pattern.padEnd(16)} ${c.dim(`skipped ${g.dot} ${s.reason}`)}`);
    }
    console.log(`\n  ${c.red(g.err)} nothing is exportable\n`);
    return 1;
  }

  const apiPort = await freePort();
  const frontPort = await freePort();
  process.env.API_PORT = String(apiPort);
  process.env.PORT = String(frontPort);
  process.env.BORGO_RELOAD = "1"; // quiet startup lines from the servers

  // loaders and prerenderPaths run for real, so they get a real api: the
  // binary is built and spawned on an ephemeral port, and killed at the end
  let apiProc: import("bun").Subprocess | null = null;
  if (needApi) {
    // a scratch binary: dist/ may be running under borgo start right now,
    // and windows locks executing binaries against overwrite
    const bin = `.borgo/export-${goBinName()}`;
    const goBuild = Bun.spawn(["go", "build", "-o", bin, "."], { stdout: "inherit", stderr: "inherit" });
    if ((await goBuild.exited) !== 0) {
      console.error(`  ${c.red(g.err)} go build failed`);
      return 1;
    }
    // explicit env: a mutated process.env does not reliably reach children
    apiProc = Bun.spawn([bin], {
      stdout: "ignore",
      stderr: "inherit",
      env: { ...process.env, API_PORT: String(apiPort), PORT: String(frontPort) },
    });
    const deadline = Date.now() + 30_000;
    for (;;) {
      try {
        await fetch(`http://localhost:${apiPort}/`, { signal: AbortSignal.timeout(1_000) });
        break;
      } catch {}
      if (Date.now() > deadline) {
        console.error(`  ${c.red(g.err)} api never answered on :${apiPort}`);
        apiProc.kill();
        return 1;
      }
      await Bun.sleep(100);
    }
  }

  let failures = 0;
  try {
    const apiUrl = `http://localhost:${apiPort}/api`;
    const api = makeApiClient(`http://localhost:${apiPort}`);

    // expand dynamic routes now that the api answers
    const pages: Array<{ path: string; route: Route }> = [];
    for (const { route, dynamic } of plans) {
      if (!dynamic) {
        pages.push({ path: route.pattern, route });
        continue;
      }
      const sets = await route.module.prerenderPaths!({ api, apiUrl });
      for (const params of sets) pages.push({ path: fillPattern(route.pattern, params), route });
    }

    // the real front server renders, so an export is byte-identical to ssr
    const { serve } = await import("./server");
    await serve({ dev: false });

    const outDir = "dist/site";
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    let written = 0;
    for (const { path, route } of pages) {
      const zeroJs = route.module.hydrate === false && !route.islands;
      const target = join(outDir, outputPath(path));
      try {
        const res = await fetch(`http://localhost:${frontPort}${path}`);
        if (!res.ok) throw new Error(`responded ${res.status}`);
        const html = await res.text();
        mkdirSync(dirname(target), { recursive: true });
        await Bun.write(target, html);
        written++;
        const rel = target.replaceAll("\\", "/");
        const note = zeroJs ? ` ${g.dot} zero js` : "";
        console.log(`  ${c.sage(g.ok)} ${path.padEnd(16)} ${c.dim(`${g.arrow} ${rel}${note}`)}`);
      } catch (error) {
        failures++;
        console.log(`  ${c.red(g.err)} ${path.padEnd(16)} ${error instanceof Error ? error.message : error}`);
      }
    }
    // a _404 page exports as 404.html, the file static hosts serve for unknown
    // paths (nginx error_page, most static hosting picks it up by name); it is
    // its own line item, not one of the pages
    let wrote404 = false;
    if (export404) {
      // any unmatched path renders the _404 page with a 404 status
      try {
        const res = await fetch(`http://localhost:${frontPort}/__borgo-export-404-probe`);
        if (res.status !== 404) throw new Error(`responded ${res.status}`);
        await Bun.write(join(outDir, "404.html"), await res.text());
        wrote404 = true;
        console.log(
          `  ${c.sage(g.ok)} ${"404".padEnd(16)} ${c.dim(`${g.arrow} ${outDir}/404.html ${g.dot} wire it as your host's error page`)}`,
        );
      } catch (error) {
        failures++;
        console.log(`  ${c.red(g.err)} ${"404".padEnd(16)} ${error instanceof Error ? error.message : error}`);
      }
    }
    for (const s of skipped) {
      console.log(`  ${c.dim(g.dot)} ${s.pattern.padEnd(16)} ${c.dim(`skipped ${g.dot} ${s.reason}`)}`);
    }

    // assets ride along, precompressed siblings included, so hydrated pages
    // find their chunks next to the html
    let assets = 0;
    let precompressed = 0;
    if (existsSync("public")) {
      cpSync("public", outDir, { recursive: true });
      ({ assets, precompressed } = countAssets("public"));
    }

    const mark = failures ? c.red(g.err) : c.sage(g.ok);
    console.log(
      `\n  ${mark} ${exportSummary(written, wrote404, assets, precompressed)} ${g.arrow} dist/site in ${c.bold(fmtMs(performance.now() - t0))}`,
    );
    if (failures) console.log(`  ${c.red(g.err)} ${failures} page(s) failed to export`);
    console.log(
      `  ${c.dim(`${g.dot} a static export serves pages only: actions, sse and websocket topics need borgo start`)}\n`,
    );
  } finally {
    apiProc?.kill();
    await apiProc?.exited;
  }
  return failures ? 1 : 0;
}
