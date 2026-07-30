# Dev experience

The dev loop: fast refresh and its contract, styling (SCSS by default, Tailwind opt-in), the error overlay, `borgo doctor`, and the troubleshooting list.

## Fast refresh

`borgo dev` keeps the browser hot over a WebSocket channel (`/__borgo/dev`):

- **Component, page and hook edits** apply through [react-refresh](https://www.npmjs.com/package/react-refresh) with the full babel transform (dev builds only) — the current route's new chunk is imported, loader props are refetched, and component state survives a body edit. Changing a component's *hooks* (add, remove, reorder, or a signature change inside a custom hook) remounts just that component, Next-style; the rest of the page keeps its state. Custom hook body edits hot-apply with dependent state intact.
- **Style edits** recompile and swap the stylesheet in place, no reload, no state loss. The pipeline compiles the single root `style.scss` (plain CSS is valid SCSS — but the file watched and built is that one).
- **Everything else falls back to a full reload**: layouts and error pages (they live in the entry chunk), `index.html`, and any Go change — the API binary is rebuilt while the old one keeps serving, swapped in, and the browser reloads only once the new API actually answers.
- **A broken build doesn't take the port down**: the front server keeps serving the error overlay and the dev channel, and the page reloads itself when the next good save lands.

The mechanics, honestly: an edit restarts the front server for a clean server module graph; the browser never reloads — it reconnects and hot-applies the change from the boot greeting.

## Styling

The default pipeline compiles the single root `style.scss` to `public/assets/style.css` — expanded in dev, compressed in production. Plain CSS is valid SCSS, so no Sass knowledge is required.

### Tailwind (opt-in)

Tailwind v4 rides behind a CLI flag — never autodetection. New projects can skip the wiring entirely: `bunx create-borgo my-app --tailwind` (or answer the prompt) scaffolds everything below already done. For an existing app, three steps:

```bash
bun add tailwindcss @tailwindcss/cli
```

Create `style.css` in the app root:

```css
@import "tailwindcss";
```

Then pass `--tailwind` to the commands in `package.json`:

```json
{
  "scripts": {
    "dev": "borgo dev --tailwind",
    "build": "borgo build --tailwind",
    "start": "borgo start --tailwind"
  }
}
```

With the flag, `@tailwindcss/cli` owns the stylesheet: it scans pages and islands for class names and rewrites `public/assets/style.css` (minified in production builds). Editing a page hot-applies new utilities through the normal refresh cycle, and editing `style.css` swaps the stylesheet in place. Without the flag, the SCSS pipeline stays in charge and `style.css` is ignored.

In dev, SSR errors render as a readable overlay page instead of the production 500 page, and the client runtime surfaces uncaught errors and unhandled rejections in-browser, with a dismissable overlay showing the stack.

## borgo doctor

`borgo doctor` diagnoses the environment: bun on `PATH` (including the npm-installed-shim trap), go and its version against your `go.mod`, both ports free — naming the process that holds one — a stale api process locking the dev binary swap, generated api types fresh against `api/*.go`, `node_modules` present, and the app's dependencies sane. Every failing check prints its one-line fix, and the exit code is 1 so it can gate scripts.

## Troubleshooting

Moved to its own page as it grew: [FAQ and troubleshooting](faq-and-troubleshooting.md). The short version: start with `bunx borgo doctor` — it diagnoses the common ones and prints the fix.
