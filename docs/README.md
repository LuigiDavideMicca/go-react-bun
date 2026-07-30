# borgo docs

Deep dives for every convention the [README](../README.md) summarizes.

- [Pages and routing](pages-and-routing.md) — pages and loaders, layouts, `<head>` management, streaming SSR, form actions, error pages
- [The typed bridge](typed-bridge.md) — Go API routes, borgogen, typed request bodies, type overrides, honest limits
- [Client navigation and hydration](client-navigation.md) — client-side transitions, prefetching, scroll restoration, code splitting, hydration modes, islands
- [Realtime](realtime.md) — server-sent events, WebSocket topics, typed event payloads, `borgo.Push`/`PushT`
- [Auth and sessions](auth-and-sessions.md) — signed-cookie sessions, password hashing, `borgo.Auth` login/logout/register, guards on both sides of the bridge, CSRF for actions
- [Dev experience](dev-experience.md) — fast refresh and its contract, the error overlay, `borgo doctor`, troubleshooting
- [Deploy](deploy.md) — Docker, compose, reverse proxy, systemd, static export, caching, health and metrics, environment reference
