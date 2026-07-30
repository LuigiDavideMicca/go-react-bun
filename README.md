<p align="center"><img src="assets/logo.svg" width="160" alt="borgo"/></p>

# borgo

<p>
  <a href="https://www.npmjs.com/package/borgo-framework"><img src="https://img.shields.io/npm/v/borgo-framework?label=borgo-framework&amp;color=c2552b" alt="npm borgo-framework"/></a>
  <a href="https://www.npmjs.com/package/create-borgo"><img src="https://img.shields.io/npm/v/create-borgo?label=create-borgo&amp;color=c2552b" alt="npm create-borgo"/></a>
  <a href="https://github.com/LuigiDavideMicca/borgo/actions/workflows/ci.yml"><img src="https://github.com/LuigiDavideMicca/borgo/actions/workflows/ci.yml/badge.svg" alt="ci"/></a>
  <a href="https://pkg.go.dev/github.com/LuigiDavideMicca/borgo"><img src="https://pkg.go.dev/badge/github.com/LuigiDavideMicca/borgo.svg" alt="go reference"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-sage" alt="license MIT"/></a>
</p>

*Italian for "village": small, self-governing, self-hosted.*

borgo is a mini Vercel-style full-stack framework: file-based React pages server-rendered by Bun, API routes written in Go. You get the DX — `bunx create-borgo my-app`, drop a file in `pages/`, drop a file in `api/`, one dev command — without the platform. Deployment is one Go binary and one Bun server on any box you control.

Pages get nested layouts, per-page `<head>` management, streaming SSR through Suspense, client-side navigation with hover/viewport prefetching and scroll restoration, per-route code splitting, opt-out and deferred hydration plus islands, form actions with post/redirect/get, live updates over server-sent events and first-class typed WebSocket topics, signed-cookie sessions, fast refresh in dev, custom 404/500 pages, and static export for the pages that need no server — all through file conventions. Loaders and actions talk to the Go API through a client typed end to end by `borgogen`, which reads the Go handlers with `go/types` and generates the TypeScript route map, request bodies and WebSocket payloads included. Around the core: `/healthz` on both servers with opt-in Prometheus metrics, `borgo deploy init` for the blessed reverse-proxy/systemd/compose configs, and `borgo doctor` when something is off.

The entire framework is a few thousand lines of readable TypeScript and Go; the Go runtime has zero dependencies. It exists because most of what makes Next-style frameworks pleasant is conventions, not machinery — and conventions are cheap.

## Quickstart

Prerequisites: [Bun](https://bun.sh) >= 1.3, [Go](https://go.dev) >= 1.25.

```bash
bunx create-borgo my-app
cd my-app
bun install
go mod tidy   # fetches the borgo go module
bun run dev
```

Open http://localhost:3000 — edit a page and watch fast refresh keep your state. When it's time to ship: `docker compose up -d` (the scaffold includes the Dockerfile), or see the [deploy guide](docs/deploy.md).

To poke at the full demo instead, clone this repo and run `bun install`, then `cd examples/tasks && bun run dev`.

## Conventions

**Pages** are React components in `pages/`, routed by file name:

- `pages/index.tsx` → `/`
- `pages/about.tsx` → `/about`
- `pages/tasks/[id].tsx` → `/tasks/:id`

A page may export a `loader` that runs on the server before rendering; its result becomes the component's props, both for SSR and after hydration. The `api` argument is a typed client over the Go routes — pattern, path params and response shape are all checked by `tsc`:

```tsx
import type { LoaderContext } from "borgo-framework";
import type { Task } from "../.borgo/api-types";

export async function loader({ params, api }: LoaderContext) {
  const { task } = await api("GET /api/tasks/{id}", { params: { id: params.id } });
  return { task };
}

export default function TaskDetail({ task }: { task: Task }) { /* ... */ }
```

The client throws `ApiError` (with `.status`) on non-2xx responses; `apiUrl` is the raw base URL for anything the client doesn't cover. Loader and action code is stripped from client bundles at build time, so server-only imports and secrets used there never reach the browser (CI greps the built assets for a sentinel to keep this honest).

**API routes** are Go files in `api/`. Annotate a handler with a route directive and it is mounted for you:

```go
//borgo:route GET /api/tasks
func ListTasks(w http.ResponseWriter, r *http.Request) {
    borgo.JSON(w, http.StatusOK, TaskList{Tasks: tasks})
}
```

Prefer explicitness? `init()` + `borgo.Handle("GET /api/tasks", listTasks)` still works, and both styles feed the generated types. `main.go` is five lines: import your `api` package, call `borgo.Serve()`. The Go runtime imposes no database and has zero dependencies — bring GORM, sqlc, or nothing (see `examples/tasks` for a GORM + SQLite CRUD app).

### The typed bridge

`borgogen` (run automatically by `borgo dev` on every `api/*.go` change, and by `borgo build`) statically analyzes the `api` package with `go/ast` + `go/types` — no reflection, nothing at runtime — and generates:

- `.borgo/api-types.d.ts` — route pattern → response and request types, plus a TypeScript interface for every Go struct involved (import them in your pages). A route's response type is the union of `T` across the `borgo.JSON[T]` and `borgo.WriteJSON` calls reachable from its handler — calls into helper functions in the `api` package are followed.
- `api/borgo.gen.go` — the mounting for `//borgo:route` handlers.

**Typed request bodies.** Decode with `borgo.Bind[T](r)` and borgogen types the route's request too — the api client then *requires* a matching `body`, so `api("POST /api/tasks", { body })` is checked end to end and a wrong body fails `tsc` (CI proves this with a deliberate wrong-body file):

```go
type TaskCreate struct {
    Title string `json:"title"`
    Body  string `json:"body"`
}

//borgo:route POST /api/tasks
func CreateTask(w http.ResponseWriter, r *http.Request) {
    body, err := borgo.Bind[TaskCreate](r)
    // ...
}
```

**Type overrides.** A type borgogen can't see through — anything with a custom `MarshalJSON` — maps to `unknown` by default (`time.Time` is built in as `string`). Override the mapping for any named type with a directive anywhere in the `api` package:

```go
//borgo:type gorm.io/gorm.DeletedAt string | null
```

Struct fields follow `encoding/json` semantics — tags, `omitempty`, embedded structs flattened. What remains invisible to static analysis: responses written through `json.NewEncoder` or helpers outside the `api` package, and dynamically chosen types (`borgo.JSON(w, s, any(x))` types as the static type of `x`). The tool is wired through the `tool` directive in the app's `go.mod`.

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

### Client-side navigation and code splitting

Plain `<a>` tags become client-side transitions — no `<Link>` component. The runtime intercepts same-origin left clicks (no modifier keys, no `target`, no `download`), fetches the destination's route chunk and its loader props as JSON (`?__borgo=props`) in parallel, swaps the composed tree in place and updates head, history and scroll. Anything it cannot handle — external links, unknown routes, a failed fetch — falls back to a normal full navigation.

The build emits one lazy chunk per route; React, the runtime and layouts live in the shared entry chunk, loaded once.

**Prefetching.** Links scrolled into the viewport get their route chunk prefetched; hovering (or focusing, or touching) a link additionally prefetches its loader props, kept for ten seconds and consumed by the navigation — so a hover-then-click usually renders with zero waiting. By design, props arrive as one JSON payload fetched in parallel with the chunk; loader data is not streamed on client navigations.

**Scroll restoration.** Every history entry gets a key; scroll positions are saved per entry (in `sessionStorage`, surviving reloads) and restored on back/forward. New navigations scroll to top, or to the `#fragment` target if the URL has one.

### Partial hydration

A page may export `hydrate` (as a literal, so the build can read it without executing the page):

- `export const hydrate = false` — the page is server-rendered HTML only: no props script, no client bundle, no route chunk built. Right for pure content pages; classic form actions still work, and links on it are normal full navigations.
- `export const hydrate = "visible"` — the entry loads, but the page's chunk is fetched and hydrated only when the element marked `data-borgo-visible` (or the page root, if unmarked) scrolls into view. Right for pages whose interactive part sits below a long read.

The default is eager hydration. Client-side navigation *to* a `"visible"` page hydrates it immediately — the deferral applies to the initial load, where the HTML is already on screen.

### Islands

For finer granularity than the page, drop a component in `islands/` and mark it in any page:

```tsx
import { Island } from "borgo-framework";

export const hydrate = false; // the page ships no page bundle at all

<Island name="Counter" props={{ start: 5 }} />
<Island name="Counter" props={{ start: 0 }} client="visible" />
```

On a `hydrate = false` page each island hydrates independently — through a small dedicated entry that touches only the island markers — so a content page can carry a search box without hydrating anything else. `client="visible"` waits until the island scrolls into view. On normally hydrated pages `<Island>` renders inline as part of the page tree.

The tradeoff, stated: island modules are registered eagerly, so their code rides with the client entry (and the islands entry loads React). `client="visible"` defers the hydration *work*, not the download. Props must be JSON-serializable — they are inlined into the island's HTML marker.

### Streaming SSR

Pages render through `renderToReadableStream`, so a `<Suspense>` boundary that suspends on the server sends the rest of the page immediately and streams the slow part in when it resolves. See `examples/tasks/pages/slow.tsx`.

### Form actions

A page may export an `action`; the front server runs it for `POST` requests to that page's URL — classic form posts work without any client JavaScript:

```tsx
import { redirect, type ActionContext } from "borgo-framework";

export async function action({ request, params, api }: ActionContext) {
  const form = await request.formData();
  if (!String(form.get("title") ?? "").trim()) return { error: "give the task a title" };
  await api("POST /api/tasks", { body: { title: form.get("title") } });
  return redirect("/");
}
```

Return a `Response` and it is sent as-is — `redirect(to, status = 303)` gives you post/redirect/get. Return any other object and the page re-renders with it as the `actionData` prop, merged over the loader's props.

### Server-sent events

`borgo.SSE(w, r)` turns any handler into an event stream; `borgo.NewSSEHub()` adds broadcast — `hub.Publish(event, data)` from anywhere, `hub.ServeHTTP` as the route handler. The front server proxies streams without buffering, so an `EventSource` in the browser just works. All stdlib. See the tasks example: create a task in one tab, watch it appear in another.

### WebSockets

The Bun front server is also a native WebSocket server. Browsers join named topics with the `subscribe` helper; every `{event, data}` published on a topic reaches every subscriber, including the publisher's other tabs:

```tsx
import { subscribe } from "borgo-framework";

const channel = subscribe("live", (event, data) => { /* ... */ });
channel.publish("message", "hello");   // browser -> everyone on the topic
channel.close();
```

The built-in `__count` event reports the topic's subscriber count (presence for free), and the connection reconnects itself. On the Go side, `borgo.Push(topic, event, data)` publishes into the same topics — it POSTs to the front server's internal endpoint, accepted from loopback (set `FRONT_URL` and a shared `BORGO_PUSH_KEY` when the two halves are on different hosts):

```go
borgo.PushT("live", "task-created", task.Title)
```

**Typed events.** `borgo.PushT` is `Push` with the payload visible to static analysis: called with literal topic and event strings, borgogen records the payload type in a generated `"topic/event"` map, exactly like `borgo.JSON[T]` types a route. The `subscribe` callback for that topic then narrows — checking `event` types `data`, and an event name nobody declared fails `tsc`. Browser-published events join the same map through declaration merging in any `.d.ts` of the app (see `ws-events.d.ts` in the tasks example):

```ts
declare module "borgo-framework" {
  interface WsEvents {
    "live/message": string; // browsers publish this one
  }
}
```

Topics with no declared events keep the untyped `(event: string, data: unknown)` callback, and `borgo.Push` stays available for dynamic topic or event names — those simply stay out of the map.

Go itself stays stdlib-only — the WebSocket termination lives where Bun already provides it natively. Choose SSE for one-way server→browser feeds; choose WebSocket topics for anything browsers also write to. The `/live` page in `examples/tasks` demos both directions: two-tab chat plus Go pushes.

### Static export

`borgo export` prerenders every statically exportable page into `dist/site/` — plain HTML next to the built assets (precompressed siblings included), servable by nginx, a CDN, anything. A page without a loader exports as-is; a page with a loader opts in with `export const prerender = true`, and its loader runs once, at export time, against a temporary api process. Dynamic routes list their param sets:

```tsx
export const prerender = true;
export const prerenderPaths = async ({ api }: PrerenderContext) =>
  (await api("GET /api/tasks")).tasks.map((task) => ({ id: task.ID }));
```

`hydrate = false` pages export with zero JavaScript; hydrated pages carry their chunks and hydrate against the exported props (client-side navigation falls back to plain page loads — there is no server to ask for props). Everything else is skipped, with the reason printed. An exported site is pages only: actions, SSE and WebSocket topics need the running servers. The [deploy guide](docs/deploy.md#static-export) has the nginx one-liner.

### Fast refresh in dev

`borgo dev` keeps the browser hot over a WebSocket channel (`/__borgo/dev`):

- **Component, page and hook edits** apply through [react-refresh](https://www.npmjs.com/package/react-refresh) with the full babel transform (dev builds only) — the current route's new chunk is imported, loader props are refetched, and component state survives a body edit. Changing a component's *hooks* (add, remove, reorder, or a signature change inside a custom hook) remounts just that component, Next-style; the rest of the page keeps its state. Custom hook body edits hot-apply with dependent state intact.
- **CSS edits** recompile and swap the stylesheet in place, no reload, no state loss.
- **Everything else falls back to a full reload**: layouts and error pages (they live in the entry chunk), `index.html`, and any Go change — the API binary is rebuilt while the old one keeps serving, swapped in, and the browser reloads only once the new API actually answers.
- **A broken build doesn't take the port down**: the front server keeps serving the error overlay and the dev channel, and the page reloads itself when the next good save lands.

The mechanics, honestly: an edit restarts the front server for a clean server module graph; the browser never reloads — it reconnects and hot-applies the change from the boot greeting.

### Sessions, auth and caching

Minimal stdlib helpers, honestly scoped: a signed cookie, not an auth framework.

**Sessions** are a JSON payload HMAC-signed with `SESSION_SECRET`, stored in an http-only cookie — no server-side storage, expiry signed in (set `SESSION_SECURE=1` behind https):

```go
type Session struct{ User string `json:"user"` }

//borgo:route POST /api/login
func Login(w http.ResponseWriter, r *http.Request) {
    // ...verify credentials...
    borgo.SetSession(w, Session{User: user}, 24*time.Hour)
    borgo.JSON(w, http.StatusOK, Me{User: user})
}

session, ok := borgo.GetSession[Session](r) // false when missing, tampered or expired
borgo.ClearSession(w)                       // logout
```

**Auth guards.** The front server forwards the browser's cookies on every api call a loader or action makes, so Go sees the session during SSR. A loader may return a `Response` to short-circuit — `redirect()` makes it a guard, honored on full loads and client navigations alike:

```tsx
export async function loader({ api }: LoaderContext) {
  try {
    return { me: await api("GET /api/me") };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return redirect("/login");
    throw error;
  }
}
```

On the Go side, guard route groups with a plain wrapper — handlers are ordinary `http.HandlerFunc`s:

```go
func authed(h http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        if _, ok := borgo.GetSession[Session](r); !ok {
            http.Error(w, "unauthenticated", http.StatusUnauthorized)
            return
        }
        h(w, r)
    }
}

func init() { borgo.Handle("GET /api/admin/stats", authed(adminStats)) }
```

**Caching.** `borgo.Cache(w, 5*time.Minute)` sets `Cache-Control: public, max-age=300` (optional second argument adds `stale-while-revalidate`); `borgo.NoCache(w)` sets `no-store` for anything personalized. A reverse proxy in front (see the deploy guide) turns these headers into actual caching.

### Error pages

- `pages/_404.tsx` renders unmatched routes with status 404.
- `pages/_500.tsx` renders server errors in production with status 500, without leaking the error.
- In dev, SSR errors render as a readable overlay page instead, and the client runtime surfaces uncaught errors and unhandled rejections in-browser.

Both special pages go through the normal layout chain. On the Go side, `borgo.Handle` panics with an actionable message on malformed or duplicate patterns instead of failing silently.

### Health checks and metrics

The front server answers `/healthz` with `{status, uptime, api}` — `api` reports whether the Go server answered its own `/healthz` (mounted automatically by `borgo.Serve`) within a short timeout. Point the load balancer or uptime monitor at the front one. Set `METRICS=1` and `/metrics` serves Prometheus text: request counts and a duration histogram by route pattern and status, plus process uptime — a handful of series, hand-rolled, zero dependencies. Both endpoints stay out of the request log, of compression, and of their own numbers.

### When something is off

`borgo doctor` diagnoses the environment: bun on `PATH` (including the npm-installed-shim trap), go and its version against your `go.mod`, both ports free — naming the process that holds one — a stale api process locking the dev binary swap, generated api types fresh against `api/*.go`, `node_modules` present, and the app's dependencies sane. Every failing check prints its one-line fix, and the exit code is 1 so it can gate scripts.

## Architecture

Two processes, one front door:

- **Bun front server** (`borgo dev` / `borgo start`) — server-renders pages with `react-dom/server`, serves static assets, proxies `/api/*` to the Go server. Loaders run here, fetching from Go during SSR; props are serialized into the HTML and the client bundle hydrates the same tree. Compression is built-in: `borgo build` precompresses assets to `.gz`/`.br` (hashed chunks served immutable), SSR HTML and API JSON are gzipped at runtime.
- **Go API server** — plain `net/http` with method patterns, bootstrapped by `borgo.Serve()`.

```
packages/borgo          npm: the bun/typescript core (cli, ssr server, router, build, runtime, typed api client)
packages/create-borgo   npm: project scaffolder
*.go                    go module github.com/LuigiDavideMicca/borgo: route registry, server bootstrap,
                        sse, websocket push, sessions, cache helpers (zero deps)
cmd/borgogen            go: static analysis codegen for the typed bridge and route mounting (depends on x/tools)
examples/tasks          demo app: tasks crud with gorm + sqlite, sse, websockets, islands, deferred hydration
docs/deploy.md          docker, compose, reverse proxy, systemd
```

Commands (in an app): `borgo dev` (both servers, watch, fast refresh), `borgo build` (client assets in `public/assets/`, Go binary in `dist/`), `borgo start` (run from build output, supervising both processes; `--front-only` for split deployments with `API_URL`), `borgo export` (static site in `dist/site/`), `borgo deploy init <caddy|nginx|systemd|compose>` (deploy configs), `borgo doctor` (environment diagnosis). Ports via `PORT` (front, 3000) and `API_PORT` (Go, 3501).

### Deploying

Scaffolded apps ship a multi-stage `Dockerfile` (Go builds static, the runtime is `oven/bun:slim`) and a `docker-compose.yml` with a `/data` volume for SQLite — `docker compose up -d` is a deployment. The [deploy guide](docs/deploy.md) covers the single-container and two-service layouts, Caddy and nginx reverse-proxy samples (WebSockets and SSE included), a systemd unit for bare metal, static export hosting, and the full environment reference — and `borgo deploy init` writes those configs into your project, templated with the app's name and ports.

## Tests

Three layers, all run by CI on every push:

- **Go** (`go test ./...`) — table-driven tests for the route registry, sessions (sign/verify/tamper/expiry), cache headers, the `/healthz` handler, SSE stream framing and hub broadcast/slow-client behavior, `borgo.Push` and `borgo.PushT`, and borgogen against a committed fixture app: route discovery (directives + `Handle` calls), helper following, `WriteJSON`, `Bind`, type overrides, `PushT` event extraction, snapshot freshness, and the error paths (duplicate patterns, malformed directives, dynamic push topics).
- **TypeScript** (`bun test packages/borgo/test`) — the router (patterns, matching, params), the api client (URL building, headers, `ApiError`, typed bodies plumbing), hydrate/refresh source parsing, manifest generation against a temp fixture (islands flags, client-route exclusion, precedence), every `borgo doctor` check against a fake environment, the export planner (loader/prerender/dynamic partitioning, path filling), the deploy config templates (ports, names, refuse-overwrite), and the Prometheus exposition format.
- **End-to-end** (`npx playwright test`) — against a production build of `examples/tasks`: client navigation, hover/viewport prefetching, scroll restoration, islands, hydration modes, form actions, SSE, two-tab WebSockets with Go push, streaming SSR, error pages, `/healthz` on both servers, `/metrics` series, a `borgo doctor` smoke — plus a dev-server project asserting fast refresh preserves component state (including five consecutive rapid edits), hook add/remove remounts without a reload, custom hook edits hot-apply, Go edits reload exactly once and only after the api answers, CSS hot-swaps, and layouts fall back to a reload — and an export project that runs `borgo export` and serves `dist/site` from a plain static file server, asserting content, hydration against exported props, and the zero-JS page.

## Versioning and releases

[release-please](https://github.com/googleapis/release-please) maintains a release PR from conventional commits; merging it tags `vX.Y.Z` and publishes both npm packages (`borgo`, `create-borgo`) with linked versions via npm trusted publishing, provenance attached. The Go module `github.com/LuigiDavideMicca/borgo` lives at the repo root and resolves the **same** `vX.Y.Z` tag — one version number across all three artifacts.

## How it compares

Honest comparison with the frameworks a borgo adopter would otherwise pick. ✓ means shipped and documented here; a — links to the reasoning in the next section.

| | borgo | Next.js | Nuxt | SolidStart |
| --- | --- | --- | --- | --- |
| Backend language | **Go** | Node | Node | Node |
| File-based routing, nested layouts | ✓ | ✓ | ✓ | ✓ |
| SSR + streaming Suspense | ✓ | ✓ | ✓ | ✓ |
| Typed server↔client bridge | ✓ generated from Go source, request bodies included | ✓ Server Actions (API routes: manual / tRPC) | ✓ Nitro `$fetch` | ✓ server functions |
| Client nav, prefetch, scroll restoration | ✓ | ✓ | ✓ | ✓ |
| Per-route code splitting | ✓ | ✓ | ✓ | ✓ |
| Hydration control | ✓ page-level opt-out, deferred, islands | — (RSC instead) | ✓ islands (experimental) | — (fine-grained reactivity instead) |
| Form actions | ✓ | ✓ | ✓ | ✓ |
| SSE + WebSockets first-class | ✓ typed event payloads | bring your own | ✓ Nitro | bring your own |
| Static export | ✓ `borgo export` | ✓ | ✓ | ✓ |
| Health endpoint + metrics | ✓ built-in, opt-in Prometheus | DIY | DIY | DIY |
| Sessions/auth | ✓ signed cookie + recipes | libraries | modules | libraries |
| Fast refresh | ✓ full transform | ✓ full transform | ✓ | ✓ |
| React Server Components | — | ✓ | n/a | n/a |
| ISR / edge / serverless targets | — | ✓ | ✓ | ✓ |
| Image/font optimization | — | ✓ | ✓ | — |
| Plugin ecosystem | — | ✓ | ✓ | ✓ |
| Deploy story | one box: Docker/compose/systemd, generated configs | Vercel or DIY | many presets | many presets |
| Framework size | ~4k lines incl. codegen and cli tooling, readable in a sitting | large | large | medium |

## What this is not

Everything here is a deliberate choice, with the reason attached:

- **No React Server Components.** Loaders returning serialized props are the model: they cover data-on-the-server with a runtime small enough to read. RSC needs deep bundler/runtime integration that would be most of the framework's weight for one feature.
- **No edge, serverless or ISR targets.** borgo is self-hosted by conviction — one box, two processes, a reverse proxy. `borgo.Cache` headers plus proxy caching cover what ISR covers on a single-site scale, and `borgo export` covers the fully static case.
- **No image/font optimization pipeline.** The build is one `Bun.build` call and stays that way; put a CDN or `vips` in front if you need it.
- **No plugin system.** The framework is small enough that the extension mechanism is reading the source and changing it.
- **Loader data is not streamed on client navigations** — one JSON payload, fetched in parallel with the route chunk (and usually prefetched on hover). Streaming applies to initial SSR, where it matters most.
- **Sessions are mechanics, not policy.** Signed cookie in, tamper-proof out; OAuth, user stores and CSRF strategy stay in your hands.
- **The typed bridge is static analysis, no runtime reflection.** Helpers inside `api/` are followed and `//borgo:type` covers custom marshalers; a response written through `json.NewEncoder` or a helper in another package types as `unknown` — the escape hatch is visible, not silent.
- **WebSocket topics are a relay, not RPC.** The front server forwards `{event, data}` between subscribers and Go; per-message business logic belongs in Go routes. `borgo.PushT` types the payloads end to end — the relay itself stays dumb.

## Troubleshooting

- **Start with `borgo doctor`** — it checks bun, go, both ports (naming the process holding a taken one), stale api processes, generated types freshness and the app's dependencies, each failure with its one-line fix.
- **`error: bun is not installed in %PATH%`** — the `borgo` bin shim locates `bun` through `PATH`. Start the app through Bun itself (`bun run dev`): Bun resolves its own shims even when `bun` is not on `PATH`. The error appears when something else spawns the shim, e.g. `npm run dev` or calling `node_modules/.bin/borgo` directly. To make the shim callable from anywhere, install Bun with the [official installer](https://bun.sh) so `bun` lands on `PATH`.
- **Two Buns on one machine** — an npm-installed Bun (`npm i -g bun`) puts a wrapper ahead of the official install on `PATH`. `borgo dev` spawns its workers by absolute path, so either install works for the dev loop, but prefer the official installer and check `where bun` (`which bun`) points where you expect.
- **Odd characters like `âŒ‚` in the terminal** — a legacy Windows console codepage renders UTF-8 as mojibake; borgo detects this and falls back to plain ASCII marks. `chcp 65001`, or Windows Terminal, brings the branded glyphs back.

## Roadmap

- ~~**Phase 2 — pages that feel like an app**: layouts, `<head>` management, client-side navigation, streaming SSR, form actions, error pages~~ done
- ~~**Phase 3 — typed bridge and a production build**: TypeScript types generated from Go handlers, per-route code splitting, server-only code elimination, partial hydration, route directives, server-sent events~~ done
- ~~**Phase 4 — deploy story**: multi-stage Dockerfile, compose with a SQLite volume, reverse proxy and systemd guide~~ done
- ~~**Phase 5 — production round**: complete typed bridge (helpers, `WriteJSON`, type overrides, typed request bodies), islands, prefetching and scroll restoration, fast refresh, first-class WebSockets, sessions and cache helpers, release automation~~ done
- ~~**Tier 1 — operability**: `borgo doctor`, typed WebSocket events (`borgo.PushT`), static export (`borgo export`), `/healthz` + Prometheus metrics, `borgo deploy init`~~ done

The phased roadmap is complete. What ships next is driven by [issues](https://github.com/LuigiDavideMicca/borgo/issues), not phases.

---

Built by [Luigi Micca](https://luigimicca.com).
