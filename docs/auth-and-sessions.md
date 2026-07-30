# Auth and sessions

Mechanics, not policy: borgo gives you signed-cookie sessions, password hashing behind a swappable interface, ready-made login/logout/register handlers over a user provider *you* supply, guards for both sides of the bridge, and CSRF protection for form actions. It imposes no database, no user schema, and no OAuth opinion — those stay in your hands.

The complete flow — register, login, protected page, logout — is wired in `examples/tasks` (`api/users.go`, `pages/login.tsx`, `pages/register.tsx`, `pages/account.tsx`).

## Sessions

Sessions are a JSON payload HMAC-signed with `SESSION_SECRET`, stored in an http-only cookie — no server-side storage, expiry signed in (set `SESSION_SECURE=1` behind https):

```go
type Session struct{ User string `json:"user"` }

borgo.SetSession(w, Session{User: user}, 24*time.Hour)

session, ok := borgo.GetSession[Session](r) // false when missing, tampered or expired
borgo.ClearSession(w)                       // logout
```

The front server forwards the browser's cookies on every api call a loader or action makes, so Go sees the session during SSR — and forwards `Set-Cookie` headers coming back from Go to the browser, so an action that calls a login route actually logs the browser in.

## Password hashing

`borgo.DefaultHasher` is PBKDF2-HMAC-SHA256 with OWASP parameters (600,000 iterations, 16-byte random salt), from the standard library's `crypto/pbkdf2`. The choice, honestly: argon2id is the state of the art, but it lives in `golang.org/x/crypto`, and the Go runtime's zero-dependency guarantee is part of what borgo is. PBKDF2 at these parameters is an OWASP-recommended configuration and FIPS-approved; if your threat model wants argon2id, the hasher is one small interface away:

```go
type PasswordHasher interface {
    Hash(password string) (string, error)
    Verify(password, hash string) bool
}
```

Set `Auth.Hasher` to your own implementation and nothing else changes. Hashes embed their parameters (`pbkdf2$600000$<salt>$<key>`), so stored passwords keep verifying if defaults evolve.

## borgo.Auth: login, logout, register

`borgo.Auth[U]` turns a user provider into handlers. You supply `Lookup` (and optionally `Register`); the framework does the verification, the hashing, and the session:

```go
var auth = borgo.Auth[User]{
    // username -> user + stored password hash. any error answers 401.
    Lookup: func(ctx context.Context, username string) (User, string, error) {
        var user User
        err := db.DB.First(&user, "username = ?", username).Error
        return user, user.Hash, err
    },
    // optional: creates the user from an already-hashed password.
    // return borgo.ErrUserExists for a taken username -> 409.
    Register: func(ctx context.Context, username, hash string) (User, error) {
        user := User{Username: username, Hash: hash}
        return user, db.DB.Create(&user).Error
    },
    // what the session stores - keep it minimal, it rides in a cookie
    Principal: func(u User) any { return Me{Username: u.Username} },
}

func init() {
    borgo.Handle("POST /api/login", auth.LoginHandler)
    borgo.Handle("POST /api/logout", auth.LogoutHandler)
    borgo.Handle("POST /api/register", auth.RegisterHandler)
}
```

- `LoginHandler` decodes `{username, password}` (`borgo.Credentials`), verifies against the stored hash, starts the session and responds with the principal as JSON. Empty fields are a 400 before any lookup; wrong password and unknown user are both a 401 `{"error": "invalid credentials"}` — and a failed lookup still runs a hash verification, so usernames cannot be enumerated by timing.
- `RegisterHandler` hashes the password, calls `Register`, starts the session, responds 201. `borgo.ErrUserExists` becomes a 409; with no `Register` configured the route answers 404.
- `LogoutHandler` clears the cookie, responds 204.

Defaults: 7-day sessions (`MaxAge`), `DefaultHasher` (`Hasher`), the user itself as principal (`Principal`). All three are fields, not policy.

## Guarding api routes: borgo.Authed

```go
borgo.Handle("GET /api/me", borgo.Authed(currentUser))
```

Without a valid session the request is answered `401 {"error": "unauthenticated"}` and the handler never runs. borgogen sees through the wrapper, so the route keeps its generated TypeScript types. Need the principal inside the handler? `borgo.GetSession[Me](r)` as usual — `Authed` only checks validity, it does not impose a session type.

For anything beyond a boolean gate (roles, ownership), write the three-line wrapper yourself — handlers are ordinary `http.HandlerFunc`s:

```go
func admin(h http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        if s, ok := borgo.GetSession[Me](r); !ok || s.Role != "admin" {
            http.Error(w, "forbidden", http.StatusForbidden)
            return
        }
        h(w, r)
    }
}
```

## Guarding pages: the loader guard

**This is the pattern** for protected pages. A loader may return a `Response` to short-circuit rendering; `redirect()` makes it a guard, honored on full loads and client navigations alike:

```tsx
import { ApiError, redirect, type LoaderContext } from "borgo-framework";

export async function loader({ api }: LoaderContext) {
  try {
    return { me: await api("GET /api/me") };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return redirect("/login");
    throw error;
  }
}
```

The api call carries the browser's cookies, Go's `Authed` (or your own check) answers 401, the loader redirects. One source of truth — the Go route — guards both the page and the data.

## Login and logout as form actions

[Form actions](pages-and-routing.md#form-actions) work without client JavaScript, and `Set-Cookie` forwarding makes them the natural login flow:

```tsx
import { ApiError, redirect, type ActionContext } from "borgo-framework";

export async function action({ request, api }: ActionContext) {
  const form = await request.formData();
  try {
    await api("POST /api/login", {
      body: { username: form.get("username"), password: form.get("password") },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { error: "wrong username or password" };
    throw error;
  }
  return redirect("/account");
}
```

Go sets the session cookie on the api response; the front server forwards it on the action's redirect; the browser lands on `/account` logged in. Logout is the same shape: an action calling `POST /api/logout`, a redirect, done.

## CSRF protection for actions

Form actions are session-cookie-authenticated POSTs, so in production borgo protects them with a double-submit token:

- The front server issues a `borgo_csrf` cookie alongside every rendered page.
- `<CsrfField />` (from `borgo-framework`) renders a hidden input carrying the same token — put it inside every `<form method="post">`:

```tsx
import { CsrfField } from "borgo-framework";

<form method="post">
  <CsrfField />
  <input name="title" />
  <button>Add</button>
</form>
```

- On a POST to a page action, if the request carries a session cookie, the front server requires the form field to match the cookie (compared in constant time). A cross-site form post cannot read the cookie to echo it, so a forged request is answered `403 invalid csrf token` before the action runs.

The rules, precisely: enforcement is **on by default in production**, applies only to page actions (api routes under `/api/*` are yours to protect — they don't accept cross-site form posts as JSON anyway), and only when the request carries a session cookie — anonymous forms keep working without the field. Client-side navigation, PRG redirects and no-JS classic posts all pass through unchanged: the token is server-rendered into the form, and the hydrated page reads the same value from the cookie.

Escape hatches, clearly: `BORGO_CSRF=0` disables the check entirely (e.g. you terminate CSRF elsewhere); `BORGO_CSRF=1` forces it in dev, where it is otherwise off so quick experiments don't need the field.

## Caching

Not auth, but usually decided together: `borgo.Cache(w, 5*time.Minute)` for anything public, `borgo.NoCache(w)` for anything personalized — see [caching in the deploy guide](deploy.md#caching).
