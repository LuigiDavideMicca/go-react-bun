# borgo docs

Deep dives for every convention the [README](../README.md) summarizes. Each page opens with what it covers; skim the index, read what you need.

| Page | One line |
| --- | --- |
| [Pages and routing](pages-and-routing.md) | pages and loaders, layouts, `<head>` management, streaming SSR, form actions, error pages |
| [The typed bridge](typed-bridge.md) | Go API routes, borgogen, typed request bodies, type overrides, honest limits |
| [Client navigation and hydration](client-navigation.md) | client-side transitions, prefetching, scroll restoration, code splitting, hydration modes, islands |
| [Realtime](realtime.md) | server-sent events, WebSocket topics, typed event payloads, `borgo.Push`/`PushT` |
| [Auth and sessions](auth-and-sessions.md) | signed-cookie sessions, password hashing, `borgo.Auth`, guards on both sides of the bridge, CSRF |
| [Dev experience](dev-experience.md) | fast refresh and its contract, styling and Tailwind, the error overlay, `borgo doctor` |
| [PWA](pwa.md) | manifest, service worker, the precache list, guarded registration |
| [Deploy](deploy.md) | Docker, compose, reverse proxy, systemd, static export, caching, health and metrics, environment reference |
| [FAQ and troubleshooting](faq-and-troubleshooting.md) | the questions people ask, and symptoms with their one-line fixes |

## Where to start

**Building your first app** — read in this order; each page builds on the one before:

1. [Pages and routing](pages-and-routing.md) — the page model everything else hangs off
2. [The typed bridge](typed-bridge.md) — how Go handlers become typed TypeScript calls
3. [Client navigation and hydration](client-navigation.md) — what happens after the first paint
4. [Auth and sessions](auth-and-sessions.md) and [realtime](realtime.md) — when the app needs them
5. [Dev experience](dev-experience.md) — worth ten minutes once, so the dev loop never surprises you

**Running an app in production** — [deploy](deploy.md) is self-contained: pick a layout (single container, two services, systemd), put a reverse proxy in front, wire `/healthz`, and keep the [environment reference](deploy.md#environment-reference) at hand. [Static export](deploy.md#static-export) is there too, for the pages that need no server.
