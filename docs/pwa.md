# PWA

Making a borgo app installable and able to serve its own assets offline. One command writes the files, two one-line edits wire them up, and the rest of this page explains what you got so you can change it.

## Set it up

```bash
bunx borgo pwa init
```

That writes two files into `public/`:

- **`manifest.webmanifest`** — the install metadata: your app's name, colors taken from borgo's palette, `display: standalone`, and icon entries. Edit the names and colors; they are yours.
- **`sw.js`** — a working service worker, described below.

Then the two lines the command prints. In `index.html`, inside `<head>`:

```html
<link rel="manifest" href="/manifest.webmanifest" />
```

And in a page or layout that hydrates:

```tsx
import { useEffect } from "react";
import { registerServiceWorker } from "borgo-framework";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => registerServiceWorker(), []);
  return <div className="app">{children}</div>;
}
```

The manifest references `/icon-192.png` and `/icon-512.png`, which you supply — a browser will install the app without them, but it will not look like yours.

## What the generated worker does

It caches **build output only**: the JavaScript chunks and stylesheet that `borgo build` produced, listed in `/assets/precache.json` together with a `stamp`:

```json
{ "stamp": "8713…", "assets": ["/assets/client.js", "/assets/style.css", "…"] }
```

The stamp is a hash of that content, so it changes exactly when the build output changes — and *does not* change when a rebuild produces identical bytes. The worker uses it as its cache name, which gives you the two behaviors you want for free: a deploy invalidates the cache, and a no-op rebuild leaves a warm cache alone.

On install it fills `app-<stamp>`; on activate it deletes every other `app-*` cache and claims open tabs; on fetch it answers same-origin `/assets/` requests from the cache, falling through to the network for everything else.

`sw.js` is served from the site root with `Cache-Control: no-cache`, so a browser re-checks it on every deploy rather than running last week's worker.

## What it deliberately does not cache

**Documents.** Server-rendered pages are dynamic and session-dependent, and they ship `Cache-Control: private, no-store`. A blanket document cache in a service worker is how one user ends up looking at another user's page. If you want an offline experience, cache a dedicated offline page and serve *that* on a failed navigation, rather than caching real pages:

```js
// in sw.js, added to the fetch handler
if (event.request.mode === "navigate") {
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
}
```

**`/api/` responses.** Same reasoning, plus mutations. Cache what your app decides is safe, explicitly, per route.

**`precache.json` itself.** Caching it would pin the worker to an old stamp permanently — the one bug in this design that is genuinely hard to recover from, so the generated worker excludes it by path.

## Registration, and why it refuses in dev

`registerServiceWorker(path = "/sw.js")` no-ops server-side, in browsers without support, and **in development**. That last one is deliberate: a caching worker attached to a dev server will serve you yesterday's chunks while you edit, and you will spend an afternoon convincing yourself that fast refresh is broken. Production builds register normally.

If you need to test the worker locally, run a production build: `bun run build && bun run start`.

## Caveats, honestly

- A service worker outlives your deploys. Ship one only if you are prepared to debug it — an app that is wrong for one user, forever, because of a cached worker is a worse failure than a slow first paint. The dev guard is the first line of that defense; the stamp is the second.
- `borgo export` output is plain static files, and a worker works there too — but `precache.json` lists build assets, not exported pages, so an offline-capable static site needs its asset list extended.
- Nothing here makes your app work offline by itself. It makes the shell load instantly and survive a flaky connection. Real offline means deciding what your data layer does without a network, which is your app's design, not the framework's.
