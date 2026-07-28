import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { buildAssets } from "./build";
import { matchRoute, type Route } from "./router";

const DEV = !!process.env.DEV;
const PORT = Number(process.env.PORT || 3000);
const API = `http://localhost:${process.env.API_PORT || 3501}`;

await buildAssets(DEV);
const { routes } = (await import("./routes.gen")) as { routes: Route[] };
const shell = await Bun.file("index.html").text();

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/")) {
      return fetch(API + url.pathname + url.search, req);
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
      ? await route.module.loader({ params, api: `${API}/api` })
      : {};

    const app = renderToString(createElement(route.module.default, props));
    const propsJson = JSON.stringify(props).replaceAll("<", "\\u003c");

    const html = shell
      .replace("<!--app-->", app)
      .replace("<!--props-->", `<script>window.__PROPS__=${propsJson}</script>`);

    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
});

console.log(`front server on http://localhost:${PORT} (${DEV ? "dev" : "prod"})`);
