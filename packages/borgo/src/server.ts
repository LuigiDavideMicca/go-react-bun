import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildAssets } from "./build";
import { matchRoute, resolveHead, type Head, type Route } from "./router";

// resolve react from the app, not from this package: with a linked borgo
// checkout the two would otherwise be different copies and hooks would break
const appRequire = createRequire(join(process.cwd(), "package.json"));
const React = appRequire("react") as typeof import("react");
const { renderToReadableStream } = appRequire("react-dom/server") as typeof import("react-dom/server");

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function headHtml(head: Head): string {
  let html = "";
  if (head.title) html += `<title>${escapeHtml(head.title)}</title>`;
  for (const meta of head.meta ?? []) {
    const attrs = Object.entries(meta)
      .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
      .join("");
    html += `<meta${attrs} data-borgo-head>`;
  }
  return html;
}

function composeElement(route: Route, props: Record<string, unknown>) {
  if (typeof route.module.default !== "function") {
    throw new Error(`pages/${route.file} must default-export a react component`);
  }
  let element = React.createElement(route.module.default, props);
  for (let i = route.layouts.length - 1; i >= 0; i--) {
    const layout = route.layouts[i];
    if (typeof layout.default !== "function") {
      throw new Error("every _layout.tsx must default-export a component taking { children }");
    }
    element = React.createElement(layout.default, null, element);
  }
  return element;
}

export async function serve({ dev = false } = {}) {
  if (dev || !existsSync(".borgo/routes.gen.tsx") || !existsSync("public/assets/client.js")) {
    await buildAssets(dev);
  }

  const manifest = pathToFileURL(join(process.cwd(), ".borgo/routes.gen.tsx")).href;
  const { routes, notFound } = (await import(manifest)) as {
    routes: Route[];
    notFound: Route | null;
  };
  const shell = await Bun.file("index.html").text();
  const [shellStart, shellEnd = ""] = shell.split("<!--app-->");
  const shellTitle = shell.match(/<title>(.*?)<\/title>/s)?.[1] ?? "";

  const port = Number(process.env.PORT || 3000);
  const api = `http://localhost:${process.env.API_PORT || 3501}`;

  async function renderPage(
    route: Route,
    params: Record<string, string>,
    status: number,
    extraProps?: Record<string, unknown>,
  ): Promise<Response> {
    const loaded = route.module.loader ? await route.module.loader({ params, api: `${api}/api` }) : {};
    const props = extraProps ? { ...loaded, ...extraProps } : loaded;

    const head = resolveHead(route.module, props);
    const stream = await renderToReadableStream(composeElement(route, props), {
      onError(error) {
        console.error(error);
      },
    });

    let start = shellStart;
    const injected = headHtml(head);
    if (injected) {
      if (head.title) start = start.replace(/<title>.*?<\/title>/s, "");
      start = start.replace("</head>", `${injected}</head>`);
    }

    const propsJson = JSON.stringify(props).replaceAll("<", "\\u003c");
    const state = `<script>window.__PROPS__=${propsJson};window.__BORGO_TITLE__=${JSON.stringify(shellTitle)}</script>`;
    const end = shellEnd.replace("<!--props-->", state);

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(start));
          // react-dom's bun build misbehaves under a manual reader pump;
          // async iteration is the reliable way to drain it
          for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
            controller.enqueue(chunk);
          }
          controller.enqueue(encoder.encode(end));
          controller.close();
        } catch (error) {
          console.error("stream pump failed:", error);
          controller.error(error);
        }
      },
    });

    return new Response(body, {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

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
      const wantsProps = url.searchParams.get("__borgo") === "props";

      if (!matched) {
        if (wantsProps) return Response.json({ notFound: true }, { status: 404 });
        if (notFound) return renderPage(notFound, {}, 404);
        return new Response("not found", { status: 404 });
      }

      if (wantsProps) {
        const { route, params } = matched;
        const props = route.module.loader
          ? await route.module.loader({ params, api: `${api}/api` })
          : {};
        return Response.json({ props });
      }

      return renderPage(matched.route, matched.params, 200);
    },
  });

  console.log(`borgo front server on http://localhost:${port} (${dev ? "dev" : "prod"})`);
}
