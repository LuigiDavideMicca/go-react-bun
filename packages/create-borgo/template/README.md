# {{name}}

A [borgo](https://github.com/LuigiDavideMicca/borgo) app: file-based React pages server-rendered by Bun, API routes written in Go.

## Prerequisites

- [Bun](https://bun.sh) >= 1.3
- [Go](https://go.dev) >= 1.25

## Setup

```bash
bun install
go mod tidy   # fetches github.com/LuigiDavideMicca/borgo at its latest version
bun run dev
```

Open http://localhost:3000.

If you are developing against a local borgo checkout, uncomment the `replace` directive in `go.mod` and point it at the checkout; drop it again once you depend on the published module.

## Commands

- `bun run dev` — both servers with watch and rebuild
- `bun run build` — production client assets and the Go API binary in `dist/`
- `bun run start` — run from the build output

## Layout

- `pages/` — React pages; file name is the route (`pages/hello/[name].tsx` → `/hello/:name`). Export a `loader` to fetch props on the server before rendering, `head` for the page title and metas, `action` to handle form posts, `hydrate` (`false` or `"visible"`) to ship less JavaScript. `_layout.tsx` wraps pages, `_404.tsx` / `_500.tsx` customize error pages.
- `api/` — Go API routes; annotate a handler with `//borgo:route GET /api/path` (or register manually in `init()` with `borgo.Handle`). Respond with `borgo.JSON` and the route's TypeScript type is generated into `.borgo/api-types.d.ts`, so the `api` client in loaders is fully typed. `borgo.NewSSEHub()` gives you live server-sent events, proxied to the browser without buffering.
- `main.go` — imports `api` and calls `borgo.Serve()`.
- `index.html` — HTML shell. `style.scss` — global styles.

Ports: front server on `PORT` (default 3000), Go API on `API_PORT` (default 3501).
