# go-react-bun

A mini Vercel-style full-stack framework: file-based React pages with SSR, API routes written in Go, glued together by Bun — in about 320 lines of framework code. No webpack, no Next.js, no Express: the point is to show how little you actually need when Bun is the runtime, the bundler and the dev server, and Go is the API layer.

This is a portfolio experiment, not a product. Every file is meant to be read.

## Architecture

Two small servers:

- **Bun front server** (`framework/server.ts`) — the front door. It server-renders pages with `react-dom/server`, serves the client bundle and static files, and proxies `/api/*` to the Go server.
- **Go API server** (`main.go` + `api/`) — plain `net/http` with Go 1.22 method patterns, GORM and a pure-Go SQLite driver (no CGO, no database to install).

React SSR needs a JS runtime, so the JS side owns HTML rendering and the Go side owns data. Pages fetch from the Go API during SSR, the resulting props are serialized into the page, and the client bundle hydrates the same component tree in the browser.

```
framework/   the framework core (~320 lines total with the Go side)
├── server.ts    front server: SSR, static files, /api proxy
├── router.ts    file path -> route pattern, URL matcher
├── build.ts     route manifest generation, scss + client bundle, go build
├── client.tsx   hydration entry
└── dev.ts       dev orchestrator: runs both servers, restarts on change

api/         Go API routes (self-registering, see below)
db/          GORM + SQLite setup
main.go      mounts the api registry and listens
pages/       React pages (file-based routing)
index.html   HTML shell with <!--app--> and <!--props--> slots
style.scss   global styles, compiled by the build
```

## Conventions

**A page is a file in `pages/`:**

- `pages/index.tsx` → `/`
- `pages/about.tsx` → `/about`
- `pages/tasks/[id].tsx` → `/tasks/:id` (one dynamic segment per path segment)

A page default-exports a component and may export a `loader` that runs on the server before rendering. Whatever the loader returns becomes the component's props, server-side and after hydration:

```tsx
import type { LoaderContext } from "../framework/router";

export async function loader({ params, api }: LoaderContext) {
  const res = await fetch(`${api}/tasks/${params.id}`);
  return { task: (await res.json()).task };
}

export default function TaskDetail({ task }) { /* ... */ }
```

`api` is the base URL of the Go server (loaders run server-side only). In the browser, components call the relative `/api/...` — the front server proxies it.

**An API route is a Go file in `api/`:** it registers its handlers and models in `init()`, and `main.go` mounts whatever ended up in the registry. Go has no dynamic file loading, so "convention" here means self-registration — adding a file is all it takes:

```go
func init() {
    model(&Task{})
    handle("GET /api/tasks", listTasks)
    handle("POST /api/tasks", createTask)
}
```

Registered models are auto-migrated into SQLite at startup.

**Static files** go in `public/` (built assets land in `public/assets/`, which is generated and git-ignored).

## Quickstart

Prerequisites: [Go](https://go.dev) 1.25+, [Bun](https://bun.sh) 1.x. Nothing else — the database is a SQLite file created on first run.

```bash
git clone https://github.com/LuigiDavideMicca/go-react-bun.git
cd go-react-bun
bun install
bun run dev
```

Open http://localhost:3000. The demo is a task list: the home page is server-rendered with data fetched from the Go API, then hydrated so the form works without reloads.

- `bun run dev` — starts both servers, rebuilds the Go binary on `.go` changes and restarts the front server on page/framework/style changes.
- `bun run build` — production client bundle in `public/assets/` plus the Go binary in `dist/`.
- `bun run start` + `./dist/api` — run the two servers without the watcher.

Ports and the SQLite path can be overridden via `.env` (see `.env.example`).

## What this is not

Not production. There is no ISR, no edge runtime, no code splitting (one client bundle contains all pages), no client-side navigation (every link is a full server-rendered page load), no streaming SSR, and error handling is the minimum that keeps the demo honest. Those are the things frameworks are actually for — this repo is about seeing the core mechanism without them.

---

Built by [Luigi Davide Micca](https://luigimicca.com).
