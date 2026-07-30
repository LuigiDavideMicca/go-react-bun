# The typed bridge

Go API routes, and the static analysis that types them end to end for TypeScript. This page covers writing API routes, `borgogen`, typed request bodies, type overrides, and the honest limits of the approach.

## API routes

API routes are Go files in `api/`. Annotate a handler with a route directive and it is mounted for you:

```go
//borgo:route GET /api/tasks
func ListTasks(w http.ResponseWriter, r *http.Request) {
    borgo.JSON(w, http.StatusOK, TaskList{Tasks: tasks})
}
```

Prefer explicitness? `init()` + `borgo.Handle("GET /api/tasks", listTasks)` still works, and both styles feed the generated types. `main.go` is five lines: import your `api` package, call `borgo.Serve()`. The Go runtime imposes no database and has zero dependencies — bring GORM, sqlc, or nothing (see `examples/tasks` for a GORM + SQLite CRUD app).

## borgogen

`borgogen` (run automatically by `borgo dev` on every `api/*.go` change, and by `borgo build`) statically analyzes the `api` package with `go/ast` + `go/types` — no reflection, nothing at runtime — and generates:

- `.borgo/api-types.d.ts` — route pattern → response and request types, plus a TypeScript interface for every Go struct involved (import them in your pages). A route's response type is the union of `T` across the `borgo.JSON[T]` and `borgo.WriteJSON` calls reachable from its handler — calls into helper functions in the `api` package are followed.
- `api/borgo.gen.go` — the mounting for `//borgo:route` handlers.

It also collects `borgo.PushT` calls into a typed WebSocket event map — see [realtime](realtime.md#typed-events). The tool is wired through the `tool` directive in the app's `go.mod`.

## Typed request bodies

Decode with `borgo.Bind[T](r)` and borgogen types the route's request too — the api client then *requires* a matching `body`, so `api("POST /api/tasks", { body })` is checked end to end and a wrong body fails `tsc` (CI proves this with a deliberate wrong-body file):

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

## Type overrides

A type borgogen can't see through — anything with a custom `MarshalJSON` — maps to `unknown` by default (`time.Time` is built in as `string`). Override the mapping for any named type with a directive anywhere in the `api` package:

```go
//borgo:type gorm.io/gorm.DeletedAt string | null
```

Struct fields follow `encoding/json` semantics — tags, `omitempty`, embedded structs flattened.

## Honest limits

The bridge is static analysis, no runtime reflection. What remains invisible to it: responses written through `json.NewEncoder` or helpers outside the `api` package, and dynamically chosen types (`borgo.JSON(w, s, any(x))` types as the static type of `x`). Those routes type as `unknown` — the escape hatch is visible, not silent.
