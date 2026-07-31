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

// the /api proxy buffers request bodies so a refused connection (api mid-
// restart) can be retried; only bodies of known, modest size qualify - a
// large upload or a chunked stream passes through once, without retry
export const PROXY_RETRY_MAX_BODY = 10 * 1024 * 1024;

export function shouldBufferBody(method: string, contentLength: string | null): boolean {
  if (method === "GET" || method === "HEAD") return false;
  if (contentLength === null) return false;
  const length = Number(contentLength);
  return Number.isInteger(length) && length >= 0 && length <= PROXY_RETRY_MAX_BODY;
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
