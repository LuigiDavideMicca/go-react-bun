<p align="center"><img src="assets/logo.svg" width="160" alt="borgo"/></p>

# borgo

*Italian for "village": small, self-governing, self-hosted.*

borgo is a mini Vercel-style full-stack framework: file-based React pages server-rendered by Bun, API routes written in Go. You get the DX — `bunx create-borgo my-app`, drop a file in `pages/`, drop a file in `api/`, one dev command — without the platform. Deployment is one Go binary and one Bun server on any box you control.

Pages get nested layouts, per-page `<head>` management, streaming SSR through Suspense, client-side navigation over plain `<a>` tags, form actions with post/redirect/get, and custom 404/500 pages — all through file conventions, no imports from a framework runtime beyond a handful of types and one `redirect` helper.

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

### Layouts

A `_layout.tsx` in any `pages/` directory wraps every page below it. Layouts nest — outermost directory first — and receive only `children`:

```tsx
export default function RootLayout({ children }: { children: ReactNode }) {
  return <div className="app"><Nav />{children}</div>;
}
```

Layouts have no loaders of their own; data belongs to pages.

### Head management

A page may export `head`: either a `Head` object or a function of the page's props.

```tsx
export const head = { title: "Tasks · borgo", meta: [{ name: "description", content: "..." }] };
// or
export const head = (props): Head => ({ title: `${props.task.title} · borgo` });
```

During SSR the title replaces the shell's `<title>` and metas are injected into `<head>`; after hydration the runtime owns both, updating them on every client-side navigation (and restoring the shell title on pages without a `head`).

### Client-side navigation

Plain `<a>` tags become client-side transitions — no `<Link>` component. The runtime intercepts same-origin left clicks (no modifier keys, no `target`, no `download`), fetches the destination's loader props as JSON from the same URL (`?__borgo=props`), swaps the composed tree in place and updates head, history and scroll. Anything it cannot handle — external links, unknown routes, a failed fetch — falls back to a normal full navigation.

### Streaming SSR

Pages render through `renderToReadableStream`, so a `<Suspense>` boundary that suspends on the server sends the rest of the page immediately and streams the slow part in when it resolves. See `examples/tasks/pages/slow.tsx`.

### Form actions

A page may export an `action`; the front server runs it for `POST` requests to that page's URL — classic form posts work without any client JavaScript:

```tsx
import { redirect, type ActionContext } from "borgo";

export async function action({ request, params, api }: ActionContext) {
  const form = await request.formData();
  if (!String(form.get("title") ?? "").trim()) return { error: "give the task a title" };
  await fetch(`${api}/tasks`, { method: "POST", /* ... */ });
  return redirect("/");
}
```

Return a `Response` and it is sent as-is — `redirect(to, status = 303)` gives you post/redirect/get. Return any other object and the page re-renders with it as the `actionData` prop, merged over the loader's props.

### Error pages

- `pages/_404.tsx` renders unmatched routes with status 404.
- `pages/_500.tsx` renders server errors in production with status 500, without leaking the error.
- In dev, SSR errors render as a readable overlay page instead, and the client runtime surfaces uncaught errors and unhandled rejections in-browser.

Both special pages go through the normal layout chain. On the Go side, `borgo.Handle` panics with an actionable message on malformed or duplicate patterns instead of failing silently.

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

Not production-grade, yet, and honest about it. One client bundle contains all pages, loaders and actions ride along into it (keep secrets in the Go side), and there is no code splitting or partial hydration. The Go side has no dynamic loading — "file-based API routes" means self-registration through `init()`.

## Roadmap

- ~~**Phase 2 — pages that feel like an app**: layouts, `<head>` management, client-side navigation, streaming SSR, form actions, error pages~~ done
- **Phase 3 — typed bridge**: generate TypeScript types from Go handlers so loaders and fetches are typed end to end
- **Phase 4 — deploy story**: a Dockerfile that builds both halves into one image, plus a guide for running behind a reverse proxy

---

Built by [Luigi Micca](https://luigimicca.com).
