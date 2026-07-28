# borgo

The Bun/TypeScript core of [borgo](https://github.com/LuigiDavideMicca/borgo): SSR front server, file-based router, build pipeline and dev orchestrator. See the repository README for the full picture.

Requires Bun >= 1.3. The package ships its TypeScript source directly — Bun runs it natively, and what you read on npm is what runs.

```bash
bunx create-borgo my-app
```

## CLI

- `borgo dev` — runs the Go API server and the SSR front server, restarting each on file changes
- `borgo build` — production client assets in `public/assets/` and the Go binary in `dist/`
- `borgo start` — runs both servers from the build output

## Exports

- `borgo` — browser-safe: the `redirect` helper plus `LoaderContext`, `ActionContext`, `Head`, `PageModule`, `Route` types and the router functions
- `borgo/server` — `serve`, the SSR front server (server-only)
- `borgo/router` — router internals shared by server and client
- `borgo/runtime` — the hydration/navigation runtime, imported by the generated client entry

The client hydration entry is generated into the app (`.borgo/client.tsx`) so that React always resolves from the app's own `node_modules`.
