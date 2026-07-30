import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { makeApiClient } from "./api";
import { buildAssets, compileCss } from "./build";
import { banner, c, fmtMs, g, statusColor } from "./colors";
import { gzipStream, isCompressiblePath, isHashedAsset, jsonResponse, pickEncoding } from "./compress";
import { CSRF_COOKIE, CSRF_FIELD, cookieValue, registerCsrf, registerIslands, withCsrf } from "./index";
import { createMetrics } from "./metrics";
import { overlayHtml } from "./overlay";
import { matchRoute, resolveHead, safeDecode, type Head, type Route } from "./router";
import { shouldBufferBody } from "./util";

const isConnRefused = (err: unknown) => {
  const e = err as { code?: string; message?: string };
  return e?.code === "ConnectionRefused" || e?.code === "ECONNREFUSED" || /unable to connect|refused/i.test(e?.message ?? "");
};

const keysEqual = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

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
  registerCsrf({
    createElement: React.createElement,
    createContext: React.createContext,
    useContext: React.useContext,
  });
  const shell = await Bun.file("index.html").text();
  const [shellStart, shellEnd = ""] = shell.split("<!--app-->");
  const shellTitle = shell.match(/<title>(.*?)<\/title>/s)?.[1] ?? "";

  const port = Number(process.env.PORT || 3000);
  const api = process.env.API_URL || `http://localhost:${process.env.API_PORT || 3501}`;
  const apiUrl = `${api}/api`;

  // the api client forwards the browser's cookies, so go handlers see the
  // session during ssr and in actions; set-cookie headers coming back from
  // go (login, logout) are collected and forwarded to the browser
  const apiFor = (req: Request, onSetCookie?: (cookies: string[]) => void) => {
    const cookie = req.headers.get("cookie");
    return makeApiClient(api, cookie ? { cookie } : {}, onSetCookie);
  };

  const runLoader = (
    req: Request,
    route: Route,
    params: Record<string, string>,
    onSetCookie?: (cookies: string[]) => void,
  ) =>
    route.module.loader
      ? route.module.loader({ request: req, params, api: apiFor(req, onSetCookie), apiUrl })
      : Promise.resolve({});

  const withCookies = (res: Response, cookies: string[]) => {
    if (!cookies.length) return res;
    const headers = new Headers(res.headers);
    for (const c of cookies) headers.append("Set-Cookie", c);
    return new Response(res.body, { status: res.status, headers });
  };

  // an action that logs in (or out) changes the cookie jar mid-request: the
  // loader that runs right after must see the new session, not the one the
  // browser sent before the action
  const withFreshCookies = (req: Request, setCookies: string[]) => {
    if (!setCookies.length) return req;
    const jar = new Map<string, string>();
    for (const part of (req.headers.get("cookie") ?? "").split(";")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
    for (const sc of setCookies) {
      const pair = sc.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      if (/;\s*max-age=0\b/i.test(sc)) jar.delete(name);
      else jar.set(name, pair.slice(eq + 1).trim());
    }
    const headers = new Headers(req.headers);
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.set("cookie", cookie);
    else headers.delete("cookie");
    return new Request(req.url, { method: req.method, headers });
  };

  // a response built by an action or a loader guard may carry headers of its
  // own (set-cookie above all); they must survive the translation to json
  const carryHeaders = (from: Response, json: Response) => {
    const headers = new Headers(json.headers);
    from.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (k === "location" || k === "set-cookie" || k.startsWith("content-")) return;
      headers.set(key, value);
    });
    for (const c of from.headers.getSetCookie()) headers.append("Set-Cookie", c);
    return new Response(json.body, { status: json.status, headers });
  };

  // csrf: a double-submit token, issued as a cookie on rendered pages and
  // required from form actions of requests carrying a session - a cross-site
  // post cannot read the cookie to echo it in the form. on by default in
  // production; BORGO_CSRF=1 forces the check in dev, BORGO_CSRF=0 disables.
  const csrfEnforced =
    process.env.BORGO_CSRF === "0" ? false : dev ? process.env.BORGO_CSRF === "1" : true;
  const csrfCookieAttrs = `Path=/; SameSite=Lax${process.env.SESSION_SECURE === "1" ? "; Secure" : ""}`;

  async function csrfRejects(req: Request): Promise<boolean> {
    if (!csrfEnforced) return false;
    const cookies = req.headers.get("cookie");
    // enforced for any browser that has been issued a token, not only for
    // live sessions: otherwise a cross-site post can log the victim into
    // the attacker's account (login csrf). cookie-less clients (curl, api
    // consumers) are unaffected.
    if (!cookieValue(cookies, "borgo_session") && !cookieValue(cookies, CSRF_COOKIE)) return false;
    const expected = cookieValue(cookies, CSRF_COOKIE);
    let given = "";
    try {
      const form = await req.clone().formData();
      given = String(form.get(CSRF_FIELD) ?? "");
    } catch {}
    return !expected || !given || !keysEqual(given, expected);
  }

  async function renderPage(
    req: Request,
    route: Route,
    params: Record<string, string>,
    status: number,
    extraProps?: Record<string, unknown>,
    extraCookies: string[] = [],
  ): Promise<Response> {
    const apiCookies = [...extraCookies];
    const loaded = await runLoader(req, route, params, (c) => apiCookies.push(...c));
    // a loader may short-circuit with a response, e.g. redirect() as a guard
    if (loaded instanceof Response) return withCookies(loaded, apiCookies);
    const props = extraProps ? { ...loaded, ...extraProps } : loaded;

    // the same token rides in the cookie and in every <CsrfField />; a
    // browser without one gets it minted alongside this page
    const cookieToken = cookieValue(req.headers.get("cookie"), CSRF_COOKIE);
    const csrfToken = cookieToken || crypto.randomUUID().replaceAll("-", "");
    if (!cookieToken) apiCookies.push(`${CSRF_COOKIE}=${csrfToken}; ${csrfCookieAttrs}`);

    const head = resolveHead(route.module, props);
    const stream = await renderToReadableStream(withCsrf(composeElement(route, props), csrfToken), {
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
        // tolerate any attribute order/extras on the client script tag; a
        // shell where it cannot be found would otherwise hydrate the wrong
        // page over this zero-js document
        .replace(
          /[ \t]*<script\b[^>]*src="\/assets\/client\.js"[^>]*><\/script>\r?\n?/,
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

    const headers = new Headers({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      Vary: "Accept-Encoding",
    });
    for (const c of apiCookies) headers.append("Set-Cookie", c);
    // gzip only: brotli is too slow for dynamic responses. no size threshold
    // here - a rendered document is virtually always past it, and the length
    // of a stream is unknown up front. the per-chunk sync flush in gzipStream
    // keeps streamed suspense content progressive.
    if (!dev && pickEncoding(req.headers.get("accept-encoding"), ["gzip"])) {
      headers.set("Content-Encoding", "gzip");
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
      // the go api restarts on every .go edit in dev: a refused connection
      // never reached it, so retrying briefly is safe even for mutations.
      // small bodies are buffered once so the request can be re-sent; large
      // or unsized bodies stream through, at the price of no retry.
      const target = api + url.pathname + url.search;
      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const buffered = shouldBufferBody(req.method, req.headers.get("content-length"));
      const body = hasBody ? (buffered ? await req.arrayBuffer() : req.body) : undefined;
      // resendable unless a real body streamed through unbuffered - a
      // body-less delete/post (body null) is as safe to retry as a get
      const retriable = !hasBody || buffered || body == null;
      for (let attempt = 0; ; attempt++) {
        try {
          // decompress: false passes go's response through untouched, encoding
          // included; bun would otherwise inflate it and resend identity
          return await fetch(target, {
            method: req.method,
            headers: req.headers,
            ...(hasBody ? { body } : {}),
            decompress: false,
          } as RequestInit);
        } catch (err) {
          if (retriable && attempt < 15 && isConnRefused(err)) {
            await Bun.sleep(250);
            continue;
          }
          // an api endpoint must fail as an api: a bad gateway status, not
          // the rendered 500 page (or the dev overlay) meant for documents
          console.error(err);
          return new Response("api unreachable", { status: 502 });
        }
      }
    }

    // decode before serving so files with spaces or unicode names resolve;
    // reject traversal and separator tricks on the decoded form. get/head
    // only: a public/ file must not shadow a page action's post
    if (req.method === "GET" || req.method === "HEAD") {
      const assetPath = safeDecode(url.pathname);
      if (
        assetPath !== "/" &&
        !assetPath.includes("..") &&
        !assetPath.includes("\\") &&
        !assetPath.includes("\0")
      ) {
        const path = "public" + assetPath;
        const asset = Bun.file(path);
        if (await asset.exists()) return serveAsset(req, path, asset);
      }
    }

    if (req.method === "POST") {
      const target = matchRoute(url.pathname, routes);
      const action = target?.route.module.action;
      // the client runtime submits enhanced forms with this header and gets
      // json back (props + actionData, or a redirect) instead of a document,
      // so the page re-renders in place without losing the scroll position.
      // classic no-js posts keep the full html render below. every response
      // on this path is marked X-Borgo (action = json envelope, raw = a full
      // document to swap in) so the runtime never has to guess.
      const wantsJson = req.headers.get("x-borgo-action") === "1";
      const actionJson = (value: unknown, init: ResponseInit = {}) => {
        const headers = new Headers(init.headers);
        headers.set("X-Borgo", "action");
        headers.set("Cache-Control", "private, no-store");
        return sendJson(req, value, { ...init, headers });
      };
      const rawDocument = (doc: Response) => {
        const headers = new Headers(doc.headers);
        headers.set("X-Borgo", "raw");
        return new Response(doc.body, { status: doc.status, headers });
      };
      if (target && action) {
        if (typeof action !== "function") {
          throw new Error(`the action export of pages/${target.route.file} must be a function`);
        }
        if (await csrfRejects(req)) {
          if (wantsJson) return actionJson({ csrf: true }, { status: 403 });
          return new Response("invalid csrf token", { status: 403 });
        }
        const apiCookies: string[] = [];
        try {
          const result = await action({
            request: req,
            params: target.params,
            api: apiFor(req, (c) => apiCookies.push(...c)),
            apiUrl,
          });
          if (result instanceof Response) {
            const location = result.headers.get("Location");
            if (wantsJson && location) {
              return withCookies(carryHeaders(result, actionJson({ redirect: location })), apiCookies);
            }
            if (wantsJson && (result.headers.get("content-type") ?? "").includes("text/html")) {
              return withCookies(rawDocument(result), apiCookies);
            }
            return withCookies(result, apiCookies);
          }
          const freshReq = withFreshCookies(req, apiCookies);
          if (wantsJson) {
            const loaded = await runLoader(freshReq, target.route, target.params, (c) =>
              apiCookies.push(...c),
            );
            if (loaded instanceof Response) {
              const location = loaded.headers.get("Location");
              if (location) {
                return withCookies(carryHeaders(loaded, actionJson({ redirect: location })), apiCookies);
              }
              return withCookies(loaded, apiCookies);
            }
            return withCookies(actionJson({ props: loaded, actionData: result }), apiCookies);
          }
          return renderPage(freshReq, target.route, target.params, 200, { actionData: result }, apiCookies);
        } catch (error) {
          if (!wantsJson) throw error;
          // the native flow would show the overlay or the 500 page; the
          // enhanced flow must deliver that same document, not vanish the
          // failure behind a silent reload
          console.error(error);
          if (dev) {
            return rawDocument(
              new Response(overlayHtml(error), {
                status: 500,
                headers: { "Content-Type": "text/html; charset=utf-8" },
              }),
            );
          }
          if (serverError) {
            try {
              return rawDocument(await renderPage(req, serverError, {}, 500));
            } catch {}
          }
          return rawDocument(new Response("internal server error", { status: 500 }));
        }
      }
      if (wantsJson && target) {
        // a post to a page without an action: tell the runtime to go native
        return actionJson({ unsupported: true }, { status: 405 });
      }
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("method not allowed", { status: 405 });
    }

    const matched = matchRoute(url.pathname, routes);
    const wantsProps = url.searchParams.get("__borgo") === "props";

    if (!matched) {
      if (wantsProps) return sendJson(req, { notFound: true }, { status: 404 });
      if (notFound) return renderPage(req, notFound, {}, 404);
      return new Response("not found", { status: 404 });
    }

    if (wantsProps) {
      const apiCookies: string[] = [];
      const props = await runLoader(req, matched.route, matched.params, (c) => apiCookies.push(...c));
      const noStore = { headers: { "Cache-Control": "private, no-store" } };
      if (props instanceof Response) {
        // surface loader redirects as data, so the client runtime can follow
        const location = props.headers.get("Location");
        if (location) {
          return withCookies(carryHeaders(props, sendJson(req, { redirect: location }, noStore)), apiCookies);
        }
        return withCookies(props, apiCookies);
      }
      return withCookies(sendJson(req, { props }, noStore), apiCookies);
    }

    return renderPage(req, matched.route, matched.params, 200);
  }

  // observability: /healthz always answers (and probes the go api with a
  // short timeout), /metrics appears with METRICS=1. both stay out of the
  // request log, the metrics themselves and any compression.
  const bootTime = Date.now();
  const metrics = process.env.METRICS === "1" ? createMetrics(bootTime) : null;

  async function healthz(): Promise<Response> {
    let apiState = "down";
    try {
      const res = await fetch(`${api}/healthz`, { signal: AbortSignal.timeout(1_500) });
      if (res.ok) apiState = "reachable";
    } catch {}
    return Response.json({
      status: apiState === "reachable" ? "ok" : "degraded",
      uptime: (Date.now() - bootTime) / 1000,
      api: apiState,
    });
  }

  const routeLabel = (pathname: string) =>
    pathname.startsWith("/api/") ? "/api/*" : (matchRoute(pathname, routes)?.route.pattern ?? "*");

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

  // a dev restart can try to bind before the os releases the previous
  // server's port; dying here would take the dev channel down for good
  const bindRetry = async <T>(start: () => T): Promise<T> => {
    const deadline = Date.now() + 15_000;
    for (;;) {
      try {
        return start();
      } catch (error) {
        if (!dev || (error as { code?: string }).code !== "EADDRINUSE" || Date.now() > deadline) {
          throw error;
        }
        await Bun.sleep(150);
      }
    }
  };

  const server = await bindRetry(() => Bun.serve<SocketData, never>({
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

      // app websockets: /ws?topics=a,b subscribes the browser to topics.
      // browsers attach cookies to ws handshakes from any origin, so a
      // cross-origin page must not be able to join (or publish into) topics
      if (url.pathname === "/ws") {
        const origin = req.headers.get("origin");
        if (origin) {
          let allowed = false;
          try {
            allowed = new URL(origin).host === url.host;
          } catch {}
          if (!allowed) return new Response("forbidden", { status: 403 });
        }
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
        // without a key, loopback-only - but behind a local reverse proxy
        // every external request arrives from 127.0.0.1, so anything the
        // proxy forwarded (it stamps forwarding headers) is rejected too
        const forwarded = req.headers.get("x-forwarded-for") || req.headers.get("forwarded");
        const authorized = key
          ? keysEqual(req.headers.get("x-borgo-key") ?? "", key)
          : isLoopback(server.requestIP(req)?.address) && !forwarded;
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
      if (url.pathname === "/healthz") return healthz();
      if (metrics && url.pathname === "/metrics") {
        return new Response(metrics.render(), {
          headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
        });
      }

      let response: Response;
      try {
        response = await handle(req);
        // pages render for HEAD too (status and headers must be real), only
        // the body is dropped - and cancelled, or the ssr/gzip pipeline
        // keeps rendering into a stream nobody reads
        if (req.method === "HEAD" && response.body) {
          const rendered = response;
          response = new Response(null, { status: rendered.status, headers: rendered.headers });
          void rendered.body?.cancel().catch(() => {});
        }
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
      if (metrics && !url.pathname.startsWith("/assets/") && url.pathname !== "/favicon.ico") {
        metrics.observe(routeLabel(url.pathname), response.status, (performance.now() - t0) / 1000);
      }
      if (dev) logRequest(req, response.status, performance.now() - t0);
      return response;
    },
  }));

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
