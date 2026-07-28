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

- `borgo` — `LoaderContext`, `PageModule`, `Route` types plus `matchRoute`, `filePathToPattern`, `buildAssets`, `serve`
- `borgo/router` — the browser-safe subset (`matchRoute`, `filePathToPattern` and the types), used by the generated client entry

The client hydration entry is generated into the app (`.borgo/client.tsx`) so that React always resolves from the app's own `node_modules`.
