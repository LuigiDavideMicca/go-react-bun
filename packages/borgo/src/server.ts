import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildAssets } from "./build";
import { matchRoute, type Route } from "./router";

// resolve react from the app, not from this package: with a linked borgo
// checkout the two would otherwise be different copies and hooks would break
const appRequire = createRequire(join(process.cwd(), "package.json"));
const { createElement } = appRequire("react") as typeof import("react");
const { renderToString } = appRequire("react-dom/server") as typeof import("react-dom/server");

export async function serve({ dev = false } = {}) {
  if (dev || !existsSync(".borgo/routes.gen.tsx") || !existsSync("public/assets/client.js")) {
    await buildAssets(dev);
  }

  const manifest = pathToFileURL(join(process.cwd(), ".borgo/routes.gen.tsx")).href;
  const { routes } = (await import(manifest)) as { routes: Route[] };
  const shell = await Bun.file("index.html").text();

  const port = Number(process.env.PORT || 3000);
  const api = `http://localhost:${process.env.API_PORT || 3501}`;

  Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname.startsWith("/api/")) {
        return fetch(api + url.pathname + url.search, req);
      }

      if (!url.pathname.includes("..")) {
        const asset = Bun.file("public" + url.pathname);
        if (url.pathname !== "/" && (await asset.exists())) return new Response(asset);
      }

      if (req.method !== "GET") return new Response("method not allowed", { status: 405 });

      const matched = matchRoute(url.pathname, routes);
      if (!matched) return new Response("not found", { status: 404 });

      const { route, params } = matched;
      const props = route.module.loader
        ? await route.module.loader({ params, api: `${api}/api` })
        : {};

      const app = renderToString(createElement(route.module.default, props));
      const propsJson = JSON.stringify(props).replaceAll("<", "\\u003c");

      const html = shell
        .replace("<!--app-->", app)
        .replace("<!--props-->", `<script>window.__PROPS__=${propsJson}</script>`);

      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    },
  });

  console.log(`borgo front server on http://localhost:${port} (${dev ? "dev" : "prod"})`);
}
