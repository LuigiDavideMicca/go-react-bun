# Client navigation and hydration

What happens after the first paint: client-side transitions, prefetching, scroll restoration, per-route code splitting, hydration modes and islands.

## Client-side navigation and code splitting

Plain `<a>` tags become client-side transitions — no `<Link>` component. The runtime intercepts same-origin left clicks (no modifier keys, no `target`, no `download`), fetches the destination's route chunk and its loader props as JSON (`?__borgo=props`) in parallel, swaps the composed tree in place and updates head, history and scroll. Anything it cannot handle — external links, unknown routes, a failed fetch — falls back to a normal full navigation.

The build emits one lazy chunk per route; React, the runtime and layouts live in the shared entry chunk, loaded once.

## Prefetching

Links scrolled into the viewport get their route chunk prefetched; hovering (or focusing, or touching) a link additionally prefetches its loader props, kept for ten seconds and consumed by the navigation — so a hover-then-click usually renders with zero waiting. By design, props arrive as one JSON payload fetched in parallel with the chunk; loader data is not streamed on client navigations.

## Scroll restoration

Every history entry gets a key; scroll positions are saved per entry (in `sessionStorage`, surviving reloads) and restored on back/forward. New navigations scroll to top, or to the `#fragment` target if the URL has one.

## Partial hydration

A page may export `hydrate` (as a literal, so the build can read it without executing the page):

- `export const hydrate = false` — the page is server-rendered HTML only: no props script, no client bundle, no route chunk built. Right for pure content pages; classic form actions still work, and links on it are normal full navigations. These pages also [export statically](deploy.md#static-export) with zero JavaScript.
- `export const hydrate = "visible"` — the entry loads, but the page's chunk is fetched and hydrated only when the element marked `data-borgo-visible` (or the page root, if unmarked) scrolls into view. Right for pages whose interactive part sits below a long read.

The default is eager hydration. Client-side navigation *to* a `"visible"` page hydrates it immediately — the deferral applies to the initial load, where the HTML is already on screen.

## Islands

For finer granularity than the page, drop a component in `islands/` and mark it in any page:

```tsx
import { Island } from "borgo-framework";

export const hydrate = false; // the page ships no page bundle at all

export default function Guide() {
  return (
    <article>
      {/* ...static content... */}
      <Island name="Counter" props={{ start: 5 }} />
      <Island name="Counter" props={{ start: 0 }} client="visible" />
    </article>
  );
}
```

On a `hydrate = false` page each island hydrates independently — through a small dedicated entry that touches only the island markers — so a content page can carry a search box without hydrating anything else. `client="visible"` waits until the island scrolls into view. On normally hydrated pages `<Island>` renders inline as part of the page tree.

The tradeoff, stated: island modules are registered eagerly, so their code rides with the client entry (and the islands entry loads React). `client="visible"` defers the hydration *work*, not the download. Props must be JSON-serializable — they are inlined into the island's HTML marker.
