<p align="center"><img src="assets/logo.svg" width="160" alt="borgo"/></p>

# borgo

*Italian for "village": small, self-governing, self-hosted.*

borgo is a mini Vercel-style full-stack framework: file-based React pages server-rendered by Bun, API routes written in Go. You get the DX — `bunx create-borgo my-app`, drop a file in `pages/`, drop a file in `api/`, one dev command — without the platform. Deployment is one Go binary and one Bun server on any box you control.

Pages get nested layouts, per-page `<head>` management, streaming SSR through Suspense, client-side navigation over plain `<a>` tags, per-route code splitting, opt-out and deferred hydration, form actions with post/redirect/get, live updates over server-sent events, and custom 404/500 pages — all through file conventions. Loaders and actions talk to the Go API through a client typed end to end by `borgogen`, which reads the Go handlers with `go/types` and generates the TypeScript route map.

The entire framework core is a few hundred lines of code, published as readable TypeScript and Go with a zero-dependency runtime. It exists because most of what makes Next-style frameworks pleasant is conventions, not machinery — and conventions are cheap.

## Quickstart

Prerequisites: [Bun](https://bun.sh) >= 1.3, [Go](https://go.dev) >= 1.25.

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

A page may export a `loader` that runs on the server before rendering; its result becomes the component's props, both for SSR and after hydration. The `api` argument is a typed client over the Go routes — pattern, path params and response shape are all checked by `tsc`:

```tsx
import type { LoaderContext } from "borgo";
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
import { Island } from "borgo";

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
import { redirect, type ActionContext } from "borgo";

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
import { subscribe } from "borgo";

const channel = subscribe("live", (event, data) => { /* ... */ });
channel.publish("message", "hello");   // browser -> everyone on the topic
channel.close();
```

The built-in `__count` event reports the topic's subscriber count (presence for free), and the connection reconnects itself. On the Go side, `borgo.Push(topic, event, data)` publishes into the same topics — it POSTs to the front server's internal endpoint, accepted from loopback (set `FRONT_URL` and a shared `BORGO_PUSH_KEY` when the two halves are on different hosts):

```go
borgo.Push("live", "task-created", task.Title)
```

Go itself stays stdlib-only — the WebSocket termination lives where Bun already provides it natively. Choose SSE for one-way server→browser feeds; choose WebSocket topics for anything browsers also write to. The `/live` page in `examples/tasks` demos both directions: two-tab chat plus Go pushes.

### Fast refresh in dev

`borgo dev` keeps the browser hot over a WebSocket channel (`/__borgo/dev`):

- **Component and page edits** apply through [react-refresh](https://www.npmjs.com/package/react-refresh) — the current route's new chunk is imported, loader props are refetched, and component state (hooks) survives the edit.
- **CSS edits** recompile and swap the stylesheet in place, no reload, no state loss.
- **Everything else falls back to a full reload**: layouts and error pages (they live in the entry chunk), `index.html`, and any Go change (the API binary is rebuilt and restarted first). Non-hydrated pages carry a tiny dev-only client that reloads on change and hot-swaps CSS.

The mechanics, honestly: an edit restarts the front server for a clean server module graph; the browser never reloads — it reconnects and hot-applies the change from the boot greeting. Component registration is name-based (top-level capitalized functions), without the full babel transform — editing a component's *hooks* may keep stale state; save again or reload if a hook edit looks off.

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

## Architecture

Two processes, one front door:

- **Bun front server** (`borgo dev` / `borgo start`) — server-renders pages with `react-dom/server`, serves static assets, proxies `/api/*` to the Go server. Loaders run here, fetching from Go during SSR; props are serialized into the HTML and the client bundle hydrates the same tree.
- **Go API server** — plain `net/http` with method patterns, bootstrapped by `borgo.Serve()`.

```
packages/borgo          npm: the bun/typescript core (cli, ssr server, router, build, hydration, typed api client)
packages/create-borgo   npm: project scaffolder
borgo.go, sse.go        go module github.com/LuigiDavideMicca/borgo: route registry, server bootstrap, sse (zero deps)
cmd/borgogen            go: static analysis codegen for the typed bridge and route mounting (depends on x/tools)
examples/tasks          demo app: tasks crud with gorm + sqlite, live updates over sse
```

Commands (in an app): `borgo dev` (both servers, watch, fast refresh), `borgo build` (client assets + Go binary in `dist/`), `borgo start` (run from build output, supervising both processes; `--front-only` for split deployments with `API_URL`). Ports via `PORT` (front, 3000) and `API_PORT` (Go, 3501).

### Deploying

Scaffolded apps ship a multi-stage `Dockerfile` (Go builds static, the runtime is `oven/bun:slim`) and a `docker-compose.yml` with a `/data` volume for SQLite — `docker compose up -d` is a deployment. The [deploy guide](docs/deploy.md) covers the single-container and two-service layouts, Caddy and nginx reverse-proxy samples (WebSockets and SSE included), a systemd unit for bare metal, and the full environment reference.

## What this is not

Not production-grade, yet, and honest about it. The old caveats are gone — routes are code-split into lazy chunks, loaders and actions are stripped from client bundles (and CI proves it), pages can opt out of or defer hydration, and Go handlers mount through generated code instead of hand-written `init()`. What remains true:

- The typed bridge is static analysis: helpers in the `api` package are followed and `//borgo:type` covers custom marshalers, but responses written through `json.NewEncoder` or helpers in other packages still type as `unknown`.
- Islands hydrate independently but their code is bundled eagerly with the entry: `client="visible"` defers work, not bytes.
- Loader data on client navigations arrives as one JSON payload fetched in parallel with the route chunk — it is not streamed.
- Fast refresh is registration-based, not the full babel transform: component edits keep state, hook-signature edits may need a reload.
- Sessions are a signed cookie, not an auth framework: no OAuth, no user store, no CSRF middleware — the helpers cover the mechanics, the policy is yours.
- One process each side, and the codegen tool (not the runtime) depends on `golang.org/x/tools`.
- WebSocket topics are a relay, not an RPC layer: the front server forwards `{event, data}` between subscribers and Go; per-message server logic belongs in Go routes.

## Roadmap

- ~~**Phase 2 — pages that feel like an app**: layouts, `<head>` management, client-side navigation, streaming SSR, form actions, error pages~~ done
- ~~**Phase 3 — typed bridge and a production build**: TypeScript types generated from Go handlers, per-route code splitting, server-only code elimination, partial hydration, route directives, server-sent events~~ done
- **Phase 4 — deploy story**: a Dockerfile that builds both halves into one image, plus a guide for running behind a reverse proxy

---

Built by [Luigi Micca](https://luigimicca.com).
