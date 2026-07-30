# PWA

What borgo provides to ship a progressive web app — a manifest, a root-scope service worker, a precache list and a guarded registration helper — and what it deliberately leaves to you (the caching strategy).

## The manifest

Put `manifest.webmanifest` in `public/` and link it from `index.html`:

```html
<link rel="manifest" href="/manifest.webmanifest" />
```

It is served with the correct `application/manifest+json` content type, like every static file in `public/`.

## The service worker

Put `sw.js` in `public/`. It is served from `/sw.js` — the site root, so its scope covers the whole app — with `Cache-Control: no-cache`, so browsers re-check it on every deploy instead of letting an old worker linger.

## The precache list

`borgo build` writes `public/assets/precache.json`:

```json
{ "stamp": "8713…", "assets": ["/assets/client.js", "/assets/style.css", "…"] }
```

`assets` lists every built JavaScript chunk and the stylesheet; `stamp` changes whenever any of that content does. A minimal cache-first worker built on it:

```js
// public/sw.js
self.addEventListener("install", (e) => {
  e.waitUntil(
    fetch("/assets/precache.json")
      .then((r) => r.json())
      .then(({ stamp, assets }) =>
        caches.open(`app-${stamp}`).then((c) => c.addAll(assets)),
      ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // drop caches from older stamps
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("app-")).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !new URL(e.request.url).pathname.startsWith("/assets/")) return;
  e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request)));
});
```

The strategy — what to precache beyond the build output, how to handle documents and `/api` calls offline — is yours. Mechanics, not policy.

## Registration

```tsx no-check
import { registerServiceWorker } from "borgo-framework";

// anywhere client-side: a hydrated page, an island, the root layout
registerServiceWorker(); // default path "/sw.js"
```

The helper no-ops server-side, in browsers without service worker support, and — importantly — **in dev**: a caching worker attached to `borgo dev` would serve yesterday's chunks and make fast refresh look haunted. Production builds register normally.

## Caveats, honestly

- The activate handler above drops *all* `app-*` caches, including the current one, and refills lazily; keep the current stamp if you want a warm cache across activations.
- SSR pages are dynamic responses (`Cache-Control: private, no-store`); if you want them offline, cache navigations explicitly in your worker with a fallback document.
- `borgo export` output is plain static files — a service worker works there too, but `precache.json` still lists only build assets, not exported pages.
