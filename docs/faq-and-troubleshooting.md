# FAQ and troubleshooting

Questions people actually ask, and symptoms with their one-line fixes. When something misbehaves, start with `bunx borgo doctor` — most of the answers below are checks it runs for you.

## FAQ

**Why Go for the API instead of TypeScript end to end?**
A single static binary, small memory footprint and real concurrency in production — while Bun still gives you the modern dev loop. The typed bridge ([borgogen](typed-bridge.md)) is what makes the split ergonomic: Go handlers become typed TypeScript calls with no OpenAPI to maintain.

**Can I write API routes in TypeScript?**
No, by design — the API side is Go. But loaders and actions run in Bun on the server, so server-side TypeScript (aggregation, PDF generation, calling the Go API) has a first-class home. See [pages and routing](pages-and-routing.md).

**Does my app work without JavaScript?**
Yes. Pages are server-rendered, forms post natively (the client runtime only *enhances* them when present), and `hydrate = false` pages ship no page JavaScript at all. See [client navigation and hydration](client-navigation.md).

**Are there React Server Components?**
No. borgo's model is one loader per page feeding plain components — simpler to reason about, and honest about where code runs. The [README](../README.md) lists what borgo deliberately is not.

**Which databases can I use?**
Any — the API is plain Go, so every Go driver works. The examples use SQLite with a `/data` volume (`DB_PATH`); swap in Postgres or anything else without touching the framework.

**Can I deploy to Vercel, Netlify or Cloudflare?**
No — borgo is self-hosted by design: any VPS, container host or bare-metal box. That is the point: no platform lock-in. See [deploy](deploy.md).

**Can I use Tailwind?**
Yes, opt-in via the `--tailwind` CLI flag — never autodetected. See [styling](dev-experience.md#styling).

**How do I add users and login?**
`borgo.Auth[U]` gives you login/logout/register handlers, PBKDF2 hashing and signed-cookie sessions on the stdlib only; the front server adds CSRF for form actions. See [auth and sessions](auth-and-sessions.md).

**Does borgo run on Windows?**
Yes, first-class — it is developed on one. The dev loop (binary swap, watcher, console glyphs) has Windows-specific handling throughout.

## Troubleshooting

- **Start with `bunx borgo doctor`** — it checks bun, go and its version against `go.mod`, both ports (naming the process holding a taken one), stale api processes, generated-types freshness and the app's dependencies, each failure with its one-line fix.
- **`error: bun is not installed in %PATH%`** — the `borgo` bin shim locates `bun` through `PATH`. Start the app through Bun itself (`bun run dev`): Bun resolves its own shims even when `bun` is not on `PATH`. The error appears when something else spawns the shim, e.g. `npm run dev` or calling `node_modules/.bin/borgo` directly. To make the shim callable from anywhere, install Bun with the [official installer](https://bun.sh).
- **Two Buns on one machine** — an npm-installed Bun (`npm i -g bun`) puts a wrapper ahead of the official install on `PATH`. `borgo dev` spawns its workers by absolute path, so either install works for the dev loop, but prefer the official installer and check `where bun` (`which bun`) points where you expect.
- **`tsc` cannot find the api types** — TypeScript skips dot-directories, so `.borgo/api-types.d.ts` must be listed explicitly in `tsconfig.json`'s `include` (every template ships this). If the types look stale instead, save any `api/*.go` file in dev or run `go tool borgogen`.
- **`413 request body too large`** — `borgo.Bind` caps bodies at 1&nbsp;MB. Routes that legitimately take more use `borgo.BindMax[T](r, limit)`; the cap exists so the default posture is safe.
- **`403 invalid csrf token` on a form post** — the form is missing `<CsrfField />` (required inside every `<form method="post">` once a csrf cookie exists). In dev the check is off by default; `BORGO_CSRF=1` forces it on, `BORGO_CSRF=0` disables it in production — don't.
- **The api refuses to start: `SESSION_SECRET must be set`** — sessions sign cookies with it. Set a long random string (32+ bytes); the server refuses weak setups at startup instead of failing per-request in the dark.
- **`502 api unreachable` in dev** — almost always a Go compile error: the watcher output shows it. The proxy retries briefly while the api restarts, so a healthy save heals on its own.
- **A stale api process holds the port or the binary** (`EPERM` renaming, "port in use") — a previous dev session died hard. `borgo doctor` names the PID; kill it and save again.
- **WebSockets or SSE die behind the reverse proxy** — the proxy must forward upgrade headers and not buffer streams. `borgo deploy init nginx` writes the working config (`proxy_buffering off`, upgrade headers, long read timeout); Caddy needs nothing special.
- **The browser shows yesterday's app in production** — if you registered a service worker, remember its cache keys on the [precache stamp](pwa.md); if not, check you rebuilt: `borgo start` refuses to serve a dev-built asset tree and rebuilds it for production.
- **Odd characters like `âŒ‚` in the terminal** — a legacy Windows console codepage renders UTF-8 as mojibake; borgo detects this and falls back to plain ASCII marks. `chcp 65001`, or Windows Terminal, brings the branded glyphs back.
