# Pages and routing

React pages in `pages/`, routed by file name, with server data through loaders and mutations through form actions. This page covers pages and loaders, layouts, `<head>` management, streaming SSR, form actions and the error pages.

## Pages and loaders

Pages are React components in `pages/`, routed by file name:

- `pages/index.tsx` → `/`
- `pages/about.tsx` → `/about`
- `pages/tasks/[id].tsx` → `/tasks/:id`

A page may export a `loader` that runs on the server before rendering; its result becomes the component's props, both for SSR and after hydration. The `api` argument is a typed client over the Go routes — pattern, path params and response shape are all checked by `tsc` (see [the typed bridge](typed-bridge.md)):

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

A loader may also return a `Response` to short-circuit rendering — `redirect()` makes it an auth guard, honored on full loads and client navigations alike. See [auth and sessions](auth-and-sessions.md) for the pattern.

## Layouts

A `_layout.tsx` in any `pages/` directory wraps every page below it. Layouts nest — outermost directory first — and receive only `children`:

```tsx
export default function RootLayout({ children }: { children: ReactNode }) {
  return <div className="app"><Nav />{children}</div>;
}
```

Layouts have no loaders of their own; data belongs to pages.

## Head management

A page may export `head`: either a `Head` object or a function of the page's props.

```tsx
import type { Head } from "borgo-framework";
import type { Task } from "../.borgo/api-types";

export const head = { title: "Tasks · borgo", meta: [{ name: "description", content: "..." }] };
// or, as a function of the page's props (typed wide on purpose - see below)
export const head = (props: Record<string, unknown>): Head => ({
  title: `${(props.task as Task).title} · borgo`,
});
```

The function form receives `Record<string, unknown>`, not your page's props type — the runtime calls every page's `head` through one signature, so a narrower parameter would not be assignable under `strictFunctionTypes`. Cast inside, as above.

During SSR the title replaces the shell's `<title>` and metas are injected into `<head>`; after hydration the runtime owns both, updating them on every client-side navigation (and restoring the shell title on pages without a `head`).

## Streaming SSR

Pages render through `renderToReadableStream`, so a `<Suspense>` boundary that suspends on the server sends the rest of the page immediately and streams the slow part in when it resolves. See `examples/tasks/pages/slow.tsx`.

## Form actions

A page may export an `action`; the front server runs it for `POST` requests to that page's URL — classic form posts work without any client JavaScript:

```tsx
import { redirect, type ActionContext } from "borgo-framework";

export async function action({ request, api }: ActionContext) {
  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "give the task a title" };
  await api("POST /api/tasks", { body: { title, body: String(form.get("body") ?? "") } });
  return redirect("/");
}
```

Return a `Response` and it is sent as-is — `redirect(to, status = 303)` gives you post/redirect/get. Return any other object and the page re-renders with it as the `actionData` prop, merged over the loader's props.

In production, actions of authenticated users are protected against cross-site request forgery by a double-submit token — see [CSRF protection](auth-and-sessions.md#csrf-protection-for-actions).

## Error pages

- `pages/_404.tsx` renders unmatched routes with status 404.
- `pages/_500.tsx` renders server errors in production with status 500, without leaking the error.
- In dev, SSR errors render as a readable overlay page instead, and the client runtime surfaces uncaught errors and unhandled rejections in-browser (see [dev experience](dev-experience.md)).

Both special pages go through the normal layout chain. On the Go side, `borgo.Handle` panics with an actionable message on malformed or duplicate patterns instead of failing silently.
