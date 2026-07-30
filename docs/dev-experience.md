# Dev experience

The dev loop: fast refresh and its contract, the error overlay, `borgo doctor`, and the troubleshooting list.

## Fast refresh

`borgo dev` keeps the browser hot over a WebSocket channel (`/__borgo/dev`):

- **Component, page and hook edits** apply through [react-refresh](https://www.npmjs.com/package/react-refresh) with the full babel transform (dev builds only) — the current route's new chunk is imported, loader props are refetched, and component state survives a body edit. Changing a component's *hooks* (add, remove, reorder, or a signature change inside a custom hook) remounts just that component, Next-style; the rest of the page keeps its state. Custom hook body edits hot-apply with dependent state intact.
- **Style edits** recompile and swap the stylesheet in place, no reload, no state loss. The pipeline compiles the single root `style.scss` (plain CSS is valid SCSS — but the file watched and built is that one).
- **Everything else falls back to a full reload**: layouts and error pages (they live in the entry chunk), `index.html`, and any Go change — the API binary is rebuilt while the old one keeps serving, swapped in, and the browser reloads only once the new API actually answers.
- **A broken build doesn't take the port down**: the front server keeps serving the error overlay and the dev channel, and the page reloads itself when the next good save lands.

The mechanics, honestly: an edit restarts the front server for a clean server module graph; the browser never reloads — it reconnects and hot-applies the change from the boot greeting.

## The error overlay

In dev, SSR errors render as a readable overlay page instead of the production 500 page, and the client runtime surfaces uncaught errors and unhandled rejections in-browser, with a dismissable overlay showing the stack.

## borgo doctor

`borgo doctor` diagnoses the environment: bun on `PATH` (including the npm-installed-shim trap), go and its version against your `go.mod`, both ports free — naming the process that holds one — a stale api process locking the dev binary swap, generated api types fresh against `api/*.go`, `node_modules` present, and the app's dependencies sane. Every failing check prints its one-line fix, and the exit code is 1 so it can gate scripts.

## Troubleshooting

- **Start with `borgo doctor`** — it checks bun, go, both ports (naming the process holding a taken one), stale api processes, generated types freshness and the app's dependencies, each failure with its one-line fix.
- **`error: bun is not installed in %PATH%`** — the `borgo` bin shim locates `bun` through `PATH`. Start the app through Bun itself (`bun run dev`): Bun resolves its own shims even when `bun` is not on `PATH`. The error appears when something else spawns the shim, e.g. `npm run dev` or calling `node_modules/.bin/borgo` directly. To make the shim callable from anywhere, install Bun with the [official installer](https://bun.sh) so `bun` lands on `PATH`.
- **Two Buns on one machine** — an npm-installed Bun (`npm i -g bun`) puts a wrapper ahead of the official install on `PATH`. `borgo dev` spawns its workers by absolute path, so either install works for the dev loop, but prefer the official installer and check `where bun` (`which bun`) points where you expect.
- **Odd characters like `âŒ‚` in the terminal** — a legacy Windows console codepage renders UTF-8 as mojibake; borgo detects this and falls back to plain ASCII marks. `chcp 65001`, or Windows Terminal, brings the branded glyphs back.
