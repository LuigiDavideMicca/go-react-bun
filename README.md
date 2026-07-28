# borgo

*Italian for "village": small, self-governing, self-hosted.*

borgo is a mini Vercel-style full-stack framework: file-based React pages server-rendered by Bun, API routes written in Go. You get the DX — `bunx create-borgo my-app`, drop a file in `pages/`, drop a file in `api/`, one dev command — without the platform. Deployment is one Go binary and one Bun server on any box you control.

The entire framework core is a few hundred lines of code, published as readable TypeScript and dependency-free Go. It exists because most of what makes Next-style frameworks pleasant is conventions, not machinery — and conventions are cheap.

## Quickstart

Prerequisites: [Bun](https://bun.sh) >= 1.3, [Go](https://go.dev) >= 1.22.

```bash
bunx create-borgo my-app
cd my-app
bun install
go mod tidy
bun run dev
```

Open http://localhost:3000.

## Conventions

**Pages** are React components in `pages/`, routed by file name:

- `pages/index.tsx` → `/`
- `pages/about.tsx` → `/about`
- `pages/tasks/[id].tsx` → `/tasks/:id`

A page may export a `loader` that runs on the server before rendering; its result becomes the component's props, both for SSR and after hydration:

```tsx
import type { LoaderContext } from "borgo";

export async function loader({ params, api }: LoaderContext) {
  const res = await fetch(`${api}/tasks/${params.id}`);
  return { task: (await res.json()).task };
}

export default function TaskDetail({ task }) { /* ... */ }
```

**API routes** are Go files in `api/` that register themselves in `init()`:

```go
func init() {
    borgo.Handle("GET /api/tasks", listTasks)
    borgo.Handle("POST /api/tasks", createTask)
}
```

`main.go` is five lines: import your `api` package, call `borgo.Serve()`. The Go core imposes no database and has zero dependencies — bring GORM, sqlc, or nothing (see `examples/tasks` for a GORM + SQLite CRUD app).

## Architecture

Two processes, one front door:

- **Bun front server** (`borgo dev` / `borgo start`) — server-renders pages with `react-dom/server`, serves static assets, proxies `/api/*` to the Go server. Loaders run here, fetching from Go during SSR; props are serialized into the HTML and the client bundle hydrates the same tree.
- **Go API server** — plain `net/http` with method patterns, bootstrapped by `borgo.Serve()`.

```
packages/borgo          npm: the bun/typescript core (cli, ssr server, router, build, hydration)
packages/create-borgo   npm: project scaffolder
borgo.go, go.mod        go module github.com/LuigiDavideMicca/borgo: route registry + server bootstrap
examples/tasks          demo app: tasks crud with gorm + sqlite
```

Commands (in an app): `borgo dev` (both servers, watch and rebuild), `borgo build` (client assets + Go binary in `dist/`), `borgo start` (run from build output). Ports via `PORT` (front, 3000) and `API_PORT` (Go, 3501).

## What this is not

Not production-grade, yet, and honest about it. One client bundle contains all pages, every navigation is a full server-rendered page load, no streaming SSR, minimal error handling. The Go side has no dynamic loading — "file-based API routes" means self-registration through `init()`.

## Roadmap

- **Phase 2 — pages that feel like an app**: layouts, `<head>` management, client-side navigation, streaming SSR
- **Phase 3 — typed bridge**: generate TypeScript types from Go handlers so loaders and fetches are typed end to end
- **Phase 4 — deploy story**: a Dockerfile that builds both halves into one image, plus a guide for running behind a reverse proxy

---

Built by [Luigi Micca](https://luigimicca.com).
