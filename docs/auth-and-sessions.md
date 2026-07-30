# Auth and sessions

Minimal stdlib helpers, honestly scoped: mechanics, not policy. borgo gives you a signed cookie, guards on both sides of the bridge, and nothing that imposes a database or a user schema.

## Sessions

Sessions are a JSON payload HMAC-signed with `SESSION_SECRET`, stored in an http-only cookie — no server-side storage, expiry signed in (set `SESSION_SECURE=1` behind https):

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

## Auth guards

The front server forwards the browser's cookies on every api call a loader or action makes, so Go sees the session during SSR. A loader may return a `Response` to short-circuit — `redirect()` makes it a guard, honored on full loads and client navigations alike:

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
