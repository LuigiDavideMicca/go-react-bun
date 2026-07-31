import { existsSync } from "node:fs";
import { c, g } from "./colors";
import type { Head } from "./router";

// attribute values are always double-quoted, so this is the complete set
export const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// a head export may be computed from loader data, so attribute names are as
// untrusted as their values: anything but a plain name - and never an event
// handler - would break out of the tag it is written into
const safeAttrName = (name: string) => /^[a-z][a-z0-9:._-]*$/i.test(name) && !/^on/i.test(name);

export function headHtml(head: Head): string {
  let html = "";
  if (head.title) html += `<title>${escapeHtml(String(head.title))}</title>`;
  for (const meta of head.meta ?? []) {
    let attrs = "";
    for (const [name, value] of Object.entries(meta)) {
      if (safeAttrName(name)) attrs += ` ${name}="${escapeHtml(String(value))}"`;
    }
    html += `<meta${attrs} data-borgo-head>`;
  }
  return html;
}

// security headers, applied to every response borgo builds itself (the /api
// proxy hands go's own headers through untouched). the defaults are:
//   X-Content-Type-Options: nosniff
//   Referrer-Policy: strict-origin-when-cross-origin
//   X-Frame-Options: DENY
//   Content-Security-Policy: default-src 'self'; base-uri 'none';
//     object-src 'none'; frame-ancestors 'none'; form-action 'self';
//     img-src 'self' data: blob:; font-src 'self' data:;
//     style-src 'self' 'unsafe-inline'; connect-src 'self';
//     script-src 'self' 'nonce-<per request>'
// the csp rides on documents and on svg (which runs its own scripts when
// navigated to directly), not on every asset. the ssr inline script carrying
// window.__PROPS__ is allowed by that per-request nonce, never by
// 'unsafe-inline'; a hydrate=false page has no inline script and is served
// the same policy without one. style-src keeps 'unsafe-inline' because react
// renders style={{}} as a style attribute, which no nonce can cover, and
// connect-src 'self' covers same-origin ws:// per csp level 3. dev swaps the
// nonce for 'unsafe-inline': the error overlay and the zero-js reload client
// are inline scripts built outside the render.
// BORGO_SECURITY_HEADERS=0 drops all of it; BORGO_CSP=0 drops the csp alone
// and BORGO_CSP=<policy> replaces it, with {nonce} substituted per request.
export const CSP_DEFAULT =
  "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; " +
  "form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; " +
  "style-src 'self' 'unsafe-inline'; connect-src 'self'; script-src 'self'";

const STATIC_SECURITY = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["X-Frame-Options", "DENY"],
] as const;

export type Security = {
  needsNonce: boolean;
  cspFor: (nonce: string) => string;
  apply: (res: Response) => Response;
};

export function createSecurity(
  dev: boolean,
  env: { headers?: string; csp?: string } = {},
): Security | null {
  if (env.headers === "0") return null;
  const enabled = env.csp !== "0";
  const template =
    env.csp && enabled ? env.csp : CSP_DEFAULT + (dev ? " 'unsafe-inline'" : "{nonce}");
  const withoutNonce = template.replaceAll("{nonce}", "");
  return {
    needsNonce: enabled && template.includes("{nonce}"),
    cspFor: (nonce) => template.replaceAll("{nonce}", ` 'nonce-${nonce}'`),
    apply(res) {
      const headers = res.headers;
      for (const [name, value] of STATIC_SECURITY) {
        if (!headers.has(name)) headers.set(name, value);
      }
      if (enabled && !headers.has("Content-Security-Policy")) {
        const type = headers.get("Content-Type") ?? "";
        if (type.startsWith("text/html") || type.startsWith("image/svg+xml")) {
          headers.set("Content-Security-Policy", withoutNonce);
        }
      }
      return res;
    },
  };
}

// json destined for an inline <script>: escaping "<" neutralizes </script>
// and <!-- inside the block, u+2028/u+2029 are valid json but not valid js
// string content for every parser, so they travel escaped too. chained
// replaceAll beats a one-pass regex with a callback by ~20% in jsc.
export const scriptJson = (value: unknown) =>
  JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");

// an action that logs in (or out) changes the jar mid-request: the loader that
// runs right after must be handed the cookies as they are now, not as the
// browser sent them. rebuilding that header means resolving duplicates, and
// every layer that resolves them differently is a way to swap a session - go
// rejects same-name cookies that disagree as ambiguous, so a jar rebuilt with
// a last-wins winner would hand go a single unambiguous cookie it would
// otherwise have refused. duplicates that disagree are dropped here too;
// identical ones are one cookie, and a Set-Cookie the api just issued settles
// the name whatever came in.
export function freshCookieHeader(cookieHeader: string | null, setCookies: string[]): string {
  const AMBIGUOUS = null;
  const jar = new Map<string, string | null>();
  for (const part of (cookieHeader ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (jar.has(name)) {
      if (jar.get(name) !== value) jar.set(name, AMBIGUOUS);
    } else {
      jar.set(name, value);
    }
  }
  for (const sc of setCookies) {
    const pair = sc.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    // go writes Max-Age=0 for any non-positive MaxAge, so this covers the
    // ClearSession(-1) that a logout action sends
    if (/;\s*max-age=0\b/i.test(sc)) jar.delete(name);
    else jar.set(name, pair.slice(eq + 1).trim());
  }
  const out: string[] = [];
  for (const [name, value] of jar) {
    if (value !== AMBIGUOUS) out.push(`${name}=${value}`);
  }
  return out.join("; ");
}

// "did we ever issue this browser a cookie of this name", regardless of what
// the value reads as. a check that switches itself off when the value is
// unusable is a check an attacker can switch off by making it unusable.
export function hasCookie(header: string | null, name: string): boolean {
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) return true;
  }
  return false;
}

// env knobs are limits: a typo must fall back to the default, never become
// NaN and silently disable the limit it was meant to tune
export function envInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export const goBinName = () => "api" + (process.platform === "win32" ? ".exe" : "");

// rfc 9110 §7.6.1: these govern one connection and are meaningless - or
// actively harmful - on the next hop. the browser -> borgo connection is not
// the borgo -> go connection, so forwarding them verbatim hands the client
// control of a hop that is not theirs:
//   Connection also *names* further headers as hop-scoped, so `Connection:
//     X-Api-Key` is a header-stripping primitive aimed at whatever go trusts;
//   Upgrade invites go to answer 101 on a pooled keep-alive socket bun will
//     reuse for the next /api request, desynchronised (the 101 guard in the
//     proxy saves the client, not the socket);
//   Proxy-Authorization / Proxy-Connection leak credentials meant for a
//     forward proxy into application-visible headers;
//   Transfer-Encoding is the client's framing of *its* request. bun frames the
//     outbound request itself - chunked for a stream, content-length for a
//     buffer, both derived from the bytes it actually writes - so passing the
//     inbound framing on can only disagree with what goes on the wire.
// measured on a 16-header browser request: ~0.9us, 0.1-0.5% of the proxy
// handler's cpu under concurrency (2.5% of a 75us handler when fully serial).
export const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
] as const;

// content-length is deliberately kept: bun recomputes it for a buffered body
// and the streamed path only ever carries the length bun's own server already
// framed the request with, so go still sees an honest r.ContentLength.
export function forwardableHeaders(headers: Headers): Headers {
  const out = new Headers(headers);
  // read Connection before deleting it; a single token carries no comma, so
  // this cannot be shortcut on one
  const connection = out.get("connection");
  if (connection) {
    for (const token of connection.split(",")) out.delete(token.trim());
  }
  for (const name of HOP_BY_HOP) out.delete(name);
  return out;
}

// the /api proxy buffers request bodies so a refused connection (api mid-
// restart) can be retried; only bodies of known, modest size qualify - a
// large upload or a chunked stream passes through once, without retry
export const PROXY_RETRY_MAX_BODY = 10 * 1024 * 1024;

// rfc 9112 §6.3 allows a request to repeat Content-Length as long as every
// value agrees, and bun.serve accepts one: `Headers` then joins the repeats
// into "5, 5". Number() reads that as NaN, which used to mean "unbuffered" -
// so a five byte body lost its retry, and the comma-joined header went on to
// go verbatim. parse the list instead, and require the values to agree.
// Number() is the wrong reader for a header value in general: it also takes
// "", "0x10", "1e3" and " 5 " as numbers a length may never be.
function parseContentLength(value: string): number | null {
  let length: number | null = null;
  for (const part of value.split(",")) {
    const token = part.trim();
    if (!/^\d+$/.test(token)) return null;
    const n = Number(token);
    if (length !== null && n !== length) return null;
    length = n;
  }
  return length;
}

export function shouldBufferBody(method: string, contentLength: string | null): boolean {
  if (method === "GET" || method === "HEAD") return false;
  if (contentLength === null) return false;
  const length = parseContentLength(contentLength);
  return length !== null && length <= PROXY_RETRY_MAX_BODY;
}

export type ProxyOptions = {
  // absolute upstream url, query included
  target: string;
  // how long to wait for response *headers*; 0 disables the deadline
  deadlineMs: number;
  // connection-refused retries (the api restarting), 0 to never retry
  retries: number;
  retryDelayMs?: number;
  // injectable for tests; production passes neither
  fetchImpl?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  onError?: (value: unknown) => void;
};

export const isConnRefused = (err: unknown) => {
  const e = err as { code?: string; message?: string };
  return e?.code === "ConnectionRefused" || e?.code === "ECONNREFUSED" || /unable to connect|refused/i.test(e?.message ?? "");
};

// the /api hop, borgo -> go. the go api restarts on every .go edit in dev: a
// refused connection never reached it, so retrying briefly is safe even for
// mutations. small bodies are buffered once so the request can be re-sent;
// large or unsized bodies stream through, at the price of no retry.
export async function proxyRequest(req: Request, options: ProxyOptions): Promise<Response> {
  const {
    target,
    deadlineMs,
    retries,
    retryDelayMs = 250,
    fetchImpl = fetch,
    sleep = Bun.sleep,
    onError = console.error,
  } = options;

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const buffered = shouldBufferBody(req.method, req.headers.get("content-length"));
  // may throw when the client hangs up mid-upload; the caller owns that (it
  // is the one holding the request that would answer 499)
  const body = hasBody ? (buffered ? await req.arrayBuffer() : req.body) : undefined;
  // hop-by-hop headers belong to the browser -> borgo connection, not to
  // this one; built once, outside the retry loop
  const headers = forwardableHeaders(req.headers);
  // resendable unless a real body streamed through unbuffered - a
  // body-less delete/post (body null) is as safe to retry as a get
  const retriable = !hasBody || buffered || body == null;

  for (let attempt = 0; ; attempt++) {
    // an api that accepts the connection and then never answers would
    // otherwise pin this request forever: the deadline covers the wait for
    // response headers only and is dropped once they arrive, so a stream
    // (sse) still runs for as long as it wants
    const abort = deadlineMs > 0 ? new AbortController() : null;
    let timedOut = false;
    const deadline = abort
      ? setTimeout(() => {
          timedOut = true;
          abort.abort();
        }, deadlineMs)
      : undefined;
    try {
      // decompress: false passes go's response through untouched, encoding
      // included; bun would otherwise inflate it and resend identity
      const upstream = await fetchImpl(target, {
        method: req.method,
        headers,
        ...(hasBody ? { body } : {}),
        decompress: false,
        signal: abort?.signal,
      } as RequestInit);
      // the deadline can fire while these headers are still in flight:
      // the abort has already torn the connection down, but fetch still
      // resolves, with a body that ends at zero bytes. returning it would
      // hand the browser a 200 it cannot tell from a genuinely empty
      // answer - and, on sse, a stream that is dead on arrival. the
      // timeout already decided; say so.
      if (timedOut) {
        void upstream.body?.cancel().catch(() => {});
        return new Response("api timeout", { status: 504 });
      }
      // an upgrade is hop-by-hop and this proxy has no tunnel to hand
      // over: relaying the 101 would leave the client speaking a switched
      // protocol into a socket that is still framing http, and every byte
      // after it desynchronised. app sockets belong on /ws.
      if (upstream.status === 101) {
        void upstream.body?.cancel().catch(() => {});
        onError(`${new URL(target).pathname} answered 101; /api cannot tunnel an upgrade`);
        return new Response("api upgrade not supported", { status: 502 });
      }
      return upstream;
    } catch (err) {
      if (timedOut) return new Response("api timeout", { status: 504 });
      if (retriable && attempt < retries && isConnRefused(err)) {
        await sleep(retryDelayMs);
        continue;
      }
      // an api endpoint must fail as an api: a bad gateway status, not
      // the rendered 500 page (or the dev overlay) meant for documents
      onError(err);
      return new Response("api unreachable", { status: 502 });
    } finally {
      clearTimeout(deadline);
    }
  }
}

// regenerate .borgo/api-types.d.ts (and the route mounting) from the go api.
// the tool is wired through the app's go.mod `tool` directive. returns
// success so build and export can refuse to ship stale generated files;
// dev ignores it and keeps serving
export async function runBorgogen(): Promise<boolean> {
  if (!existsSync("api")) return true;
  const proc = Bun.spawn(["go", "tool", "borgogen"], { stdout: "ignore", stderr: "pipe" });
  if ((await proc.exited) !== 0) {
    const stderr = await new Response(proc.stderr).text();
    console.error(stderr.trimEnd());
    console.error(
      `  ${c.red(g.err)} borgogen failed - api types are stale ${c.dim("(is `tool github.com/LuigiDavideMicca/borgo/cmd/borgogen` in go.mod?)")}`,
    );
    return false;
  }
  return true;
}
