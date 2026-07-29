import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { makeApiClient } from "./api";
import { buildAssets, compileCss } from "./build";
import { banner, c, fmtMs, g, statusColor } from "./colors";
import { gzipStream, isCompressiblePath, isHashedAsset, jsonResponse, pickEncoding } from "./compress";
import { registerIslands } from "./index";
import { overlayHtml } from "./overlay";
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
  const started = performance.now();
  let chunkMap: Record<string, string> = {};
  if (dev || !existsSync(".borgo/routes.gen.tsx") || !existsSync("public/assets/client.js")) {
    ({ chunkMap } = await buildAssets(dev));
  }

  const manifest = pathToFileURL(join(process.cwd(), ".borgo/routes.gen.tsx")).href;
  const { routes, notFound, serverError } = (await import(manifest)) as {
    routes: Route[];
    notFound: Route | null;
    serverError: Route | null;
  };
  const islandsManifest = pathToFileURL(join(process.cwd(), ".borgo/islands.gen.ts")).href;
  const { islands } = (await import(islandsManifest)) as {
    islands: Record<string, import("react").ComponentType<any>>;
  };
  registerIslands(islands, React.createElement);
  const shell = await Bun.file("index.html").text();
  const [shellStart, shellEnd = ""] = shell.split("<!--app-->");
  const shellTitle = shell.match(/<title>(.*?)<\/title>/s)?.[1] ?? "";

  const port = Number(process.env.PORT || 3000);
  const api = process.env.API_URL || `http://localhost:${process.env.API_PORT || 3501}`;
  const apiUrl = `${api}/api`;

  // the api client forwards the browser's cookies, so go handlers see the
  // session during ssr and in actions
  const apiFor = (req: Request) => {
    const cookie = req.headers.get("cookie");
    return makeApiClient(api, cookie ? { cookie } : {});
  };

  const runLoader = (req: Request, route: Route, params: Record<string, string>) =>
    route.module.loader
      ? route.module.loader({ request: req, params, api: apiFor(req), apiUrl })
      : Promise.resolve({});

  async function renderPage(
    req: Request,
    route: Route,
    params: Record<string, string>,
    status: number,
    extraProps?: Record<string, unknown>,
  ): Promise<Response> {
    const loaded = await runLoader(req, route, params);
    // a loader may short-circuit with a response, e.g. redirect() as a guard
    if (loaded instanceof Response) return loaded;
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

    let end: string;
    if (route.module.hydrate === false) {
      // the page opted out of hydration: ship no props and no client script.
      // pages with islands get the islands entry, which hydrates only those.
      // in dev a tiny inline client keeps the page live: css swaps in place,
      // anything else is a full reload.
      const islandsTag = route.islands
        ? '<script type="module" src="/assets/islands-client.js"></script>'
        : "";
      const devTag = dev
        ? "<script>(()=>{const c=()=>{const w=new WebSocket(`ws://${location.host}/__borgo/dev`);" +
          'w.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.type==="css"){for(const l of document.querySelectorAll(\'link[rel="stylesheet"]\'))l.href=l.href.split("?")[0]+"?t="+Date.now();}' +
          'else if(!m.stamp||(m.stamp>performance.timeOrigin&&Number(sessionStorage.getItem("borgo:devstamp")||0)<m.stamp)){if(m.stamp)sessionStorage.setItem("borgo:devstamp",String(m.stamp));location.reload();}};' +
          "w.onclose=()=>setTimeout(c,300);};c();})()</script>"
        : "";
      end = shellEnd
        .replace("<!--props-->", devTag)
        .replace(
          /[ \t]*<script type="module" src="\/assets\/client\.js"><\/script>\r?\n?/,
          islandsTag,
        );
    } else {
      const propsJson = JSON.stringify(props).replaceAll("<", "\\u003c");
      const devFlag = dev ? ";window.__BORGO_DEV__=1" : "";
      const state = `<script>window.__PROPS__=${propsJson};window.__BORGO_TITLE__=${JSON.stringify(shellTitle)}${devFlag}</script>`;
      end = shellEnd.replace("<!--props-->", state);
    }

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

    const headers: Record<string, string> = {
      "Content-Type": "text/html; charset=utf-8",
      Vary: "Accept-Encoding",
    };
    // gzip only: brotli is too slow for dynamic responses. no size threshold
    // here - a rendered document is virtually always past it, and the length
    // of a stream is unknown up front. the per-chunk sync flush in gzipStream
    // keeps streamed suspense content progressive.
    if (!dev && pickEncoding(req.headers.get("accept-encoding"), ["gzip"])) {
      headers["Content-Encoding"] = "gzip";
      return new Response(gzipStream(body), { status, headers });
    }
    return new Response(body, { status, headers });
  }

  // static files: hashed build outputs cache forever, compressible types are
  // served from the .gz/.br siblings that `borgo build` emitted. dev has no
  // siblings (precompression is skipped) and serves identity.
  async function serveAsset(req: Request, path: string, asset: ReturnType<typeof Bun.file>) {
    const headers: Record<string, string> = {};
    if (isHashedAsset(path)) headers["Cache-Control"] = "public, max-age=31536000, immutable";
    if (!isCompressiblePath(path)) return new Response(asset, { headers });
    headers["Vary"] = "Accept-Encoding";
    if (!dev) {
      const encoding = pickEncoding(req.headers.get("accept-encoding"), ["br", "gzip"]);
      if (encoding) {
        const sibling = Bun.file(`${path}.${encoding === "br" ? "br" : "gz"}`);
        if (await sibling.exists()) {
          headers["Content-Encoding"] = encoding;
          headers["Content-Type"] = asset.type;
          return new Response(sibling, { headers });
        }
      }
    }
    return new Response(asset, { headers });
  }

  const sendJson = (req: Request, value: unknown, init?: ResponseInit) =>
    dev ? Response.json(value, init) : jsonResponse(req, value, init);

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/")) {
      // decompress: false passes go's response through untouched, encoding
      // included; bun would otherwise inflate it and resend identity
      return fetch(new Request(api + url.pathname + url.search, req), {
        decompress: false,
      } as RequestInit);
    }

    if (!url.pathname.includes("..")) {
      const path = "public" + url.pathname;
      const asset = Bun.file(path);
      if (url.pathname !== "/" && (await asset.exists())) return serveAsset(req, path, asset);
    }

    if (req.method === "POST") {
      const target = matchRoute(url.pathname, routes);
      const action = target?.route.module.action;
      if (target && action) {
        if (typeof action !== "function") {
          throw new Error(`the action export of pages/${target.route.file} must be a function`);
        }
        const result = await action({ request: req, params: target.params, api: apiFor(req), apiUrl });
        if (result instanceof Response) return result;
        return renderPage(req, target.route, target.params, 200, { actionData: result });
      }
    }

    if (req.method !== "GET") return new Response("method not allowed", { status: 405 });

    const matched = matchRoute(url.pathname, routes);
    const wantsProps = url.searchParams.get("__borgo") === "props";

    if (!matched) {
      if (wantsProps) return sendJson(req, { notFound: true }, { status: 404 });
      if (notFound) return renderPage(req, notFound, {}, 404);
      return new Response("not found", { status: 404 });
    }

    if (wantsProps) {
      const props = await runLoader(req, matched.route, matched.params);
      if (props instanceof Response) {
        // surface loader redirects as data, so the client runtime can follow
        const location = props.headers.get("Location");
        if (location) return sendJson(req, { redirect: location });
        return props;
      }
      return sendJson(req, { props });
    }

    return renderPage(req, matched.route, matched.params, 200);
  }

  function logRequest(req: Request, status: number, ms: number) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/assets/") || path === "/favicon.ico") return;
    const method = c.dim(req.method.padEnd(4));
    console.log(`  ${method} ${path.padEnd(24)} ${statusColor(status)(String(status))} ${c.dim(fmtMs(ms))}`);
  }

  // dev channel: browsers connect over ws; a fresh boot after a code change
  // greets them with the changed file and the new page -> chunk map
  const devSockets = new Set<import("bun").ServerWebSocket<SocketData>>();
  const bootStamp = Date.now();
  const changed = process.env.BORGO_CHANGED;
  const broadcast = (msg: Record<string, unknown>) => {
    const data = JSON.stringify(msg);
    for (const ws of devSockets) ws.send(data);
  };

  type SocketData = { kind: "dev" } | { kind: "app"; topics: string[] };
  const wsTopic = (topic: string) => "borgo:ws:" + topic;
  const publishCount = (topic: string) => {
    server.publish(
      wsTopic(topic),
      JSON.stringify({ topic, event: "__count", data: server.subscriberCount(wsTopic(topic)) }),
    );
  };
  const isLoopback = (address: string | undefined) =>
    address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";

  const server = Bun.serve<SocketData, never>({
    port,
    // long-lived proxied streams (sse) must not be killed by the default 10s
    idleTimeout: 0,
    websocket: {
      open(ws) {
        if (ws.data?.kind === "app") {
          for (const topic of ws.data.topics) ws.subscribe(wsTopic(topic));
          for (const topic of ws.data.topics) publishCount(topic);
          return;
        }
        devSockets.add(ws);
        if (changed) {
          ws.send(JSON.stringify({ type: "js", file: changed, chunks: chunkMap, stamp: bootStamp }));
        }
      },
      close(ws) {
        if (ws.data?.kind === "app") {
          const topics = ws.data.topics;
          setTimeout(() => topics.forEach(publishCount), 0);
          return;
        }
        devSockets.delete(ws);
      },
      // clients may publish to topics they are subscribed to; everything is
      // json {topic, event, data}, relayed verbatim to every subscriber
      message(ws, raw) {
        if (ws.data?.kind !== "app") return;
        try {
          const msg = JSON.parse(String(raw));
          if (
            typeof msg.topic === "string" &&
            typeof msg.event === "string" &&
            ws.data.topics.includes(msg.topic)
          ) {
            server.publish(
              wsTopic(msg.topic),
              JSON.stringify({ topic: msg.topic, event: msg.event, data: msg.data }),
            );
          }
        } catch {}
      },
    },
    async fetch(req) {
      const t0 = performance.now();
      const url = new URL(req.url);

      // app websockets: /ws?topics=a,b subscribes the browser to topics
      if (url.pathname === "/ws") {
        const topics = (url.searchParams.get("topics") ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (server.upgrade(req, { data: { kind: "app", topics } })) return undefined as never;
        return new Response("upgrade required", { status: 426 });
      }

      // go -> browser push: accepted from loopback (or with the shared key)
      if (req.method === "POST" && url.pathname === "/__borgo/publish") {
        const key = process.env.BORGO_PUSH_KEY;
        const authorized = key
          ? req.headers.get("x-borgo-key") === key
          : isLoopback(server.requestIP(req)?.address);
        if (!authorized) return new Response("forbidden", { status: 403 });
        const msg = await req.json().catch(() => null);
        if (!msg || typeof msg.topic !== "string" || typeof msg.event !== "string") {
          return new Response("bad request", { status: 400 });
        }
        server.publish(
          wsTopic(msg.topic),
          JSON.stringify({ topic: msg.topic, event: msg.event, data: msg.data }),
        );
        return new Response(null, { status: 204 });
      }

      if (dev && url.pathname.startsWith("/__borgo/dev")) {
        if (url.pathname === "/__borgo/dev" && server.upgrade(req, { data: { kind: "dev" } })) {
          return undefined as never;
        }
        if (req.method === "POST" && url.pathname === "/__borgo/dev/css") {
          try {
            await compileCss(true);
          } catch (error) {
            console.error(error instanceof Error ? error.message : error);
            return new Response(null, { status: 500 });
          }
          broadcast({ type: "css" });
          return new Response(null, { status: 204 });
        }
        if (req.method === "POST" && url.pathname === "/__borgo/dev/reload") {
          broadcast({ type: "reload" });
          return new Response(null, { status: 204 });
        }
        return new Response("not found", { status: 404 });
      }
      let response: Response;
      try {
        response = await handle(req);
      } catch (error) {
        console.error(error);
        if (dev) {
          response = new Response(overlayHtml(error), {
            status: 500,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        } else if (serverError) {
          try {
            response = await renderPage(req, serverError, {}, 500);
          } catch {
            response = new Response("internal server error", { status: 500 });
          }
        } else {
          response = new Response("internal server error", { status: 500 });
        }
      }
      if (dev) logRequest(req, response.status, performance.now() - t0);
      return response;
    },
  });

  const ready = performance.now() - started;
  if (process.env.BORGO_RELOAD) {
    console.log(`  ${c.sage(g.ok)} rebuilt in ${fmtMs(ready)}`);
    return;
  }

  const table: Array<[string, string]> = routes.map((r) => [r.pattern, `pages/${r.file}`]);
  if (notFound) table.push(["404", `pages/${notFound.file}`]);
  if (serverError) table.push(["500", `pages/${serverError.file}`]);
  const width = Math.max(...table.map(([pattern]) => pattern.length));

  console.log(`\n  ${banner(dev ? "dev" : "start")}\n`);
  for (const [pattern, file] of table) {
    const colored = pattern.replace(/:(\w+)/g, (m) => c.terracotta(m));
    console.log(`  ${colored}${" ".repeat(width - pattern.length)}  ${c.dim(file)}`);
  }
  console.log(`\n  ${c.sage(g.ok)} ready in ${c.bold(fmtMs(ready))}`);
  console.log(`  ${c.terracotta(g.arrow)} app  ${c.blue(`http://localhost:${port}`)}`);
  console.log(`  ${c.terracotta(g.arrow)} api  ${c.blue(api)} ${c.dim("go, proxied at /api")}\n`);
}
