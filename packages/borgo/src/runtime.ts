// browser runtime: react is injected by the generated client entry so it
// always comes from the app's own node_modules
import type { createElement as CreateElement } from "react";
import type { hydrateRoot as HydrateRoot, Root } from "react-dom/client";
import { matchRoute, resolveHead, type Head, type Route } from "./router";

declare global {
  interface Window {
    __PROPS__?: Record<string, unknown>;
    __BORGO_TITLE__?: string;
  }
}

export type MountOptions = {
  createElement: typeof CreateElement;
  hydrateRoot: typeof HydrateRoot;
  routes: Route[];
  notFound: Route | null;
};

function compose(
  createElement: MountOptions["createElement"],
  route: Route,
  props: Record<string, unknown>,
) {
  let element = createElement(route.module.default, props);
  for (let i = route.layouts.length - 1; i >= 0; i--) {
    element = createElement(route.layouts[i].default, null, element);
  }
  return element;
}

export function mount({ createElement, hydrateRoot, routes, notFound }: MountOptions) {
  const initial = matchRoute(location.pathname, routes);
  const initialRoute = initial?.route ?? notFound;
  if (!initialRoute) return;

  const container = document.getElementById("root")!;
  const root: Root = hydrateRoot(
    container,
    compose(createElement, initialRoute, window.__PROPS__ ?? {}),
  );

  const defaultTitle = window.__BORGO_TITLE__ || document.title;

  function applyHead(head: Head) {
    document.title = head.title ?? defaultTitle;
    for (const el of document.querySelectorAll("[data-borgo-head]")) el.remove();
    for (const meta of head.meta ?? []) {
      const el = document.createElement("meta");
      for (const [key, value] of Object.entries(meta)) el.setAttribute(key, value);
      el.setAttribute("data-borgo-head", "");
      document.head.appendChild(el);
    }
  }

  async function navigate(to: URL, push: boolean) {
    const matched = matchRoute(to.pathname, routes);
    if (!matched) {
      location.assign(to.href);
      return;
    }

    let props: Record<string, unknown>;
    try {
      const sep = to.search ? "&" : "?";
      const res = await fetch(to.pathname + to.search + sep + "__borgo=props", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`props fetch failed: ${res.status}`);
      props = (await res.json()).props ?? {};
    } catch {
      location.assign(to.href);
      return;
    }

    if (push) history.pushState(null, "", to.pathname + to.search + to.hash);
    root.render(compose(createElement, matched.route, props));
    applyHead(resolveHead(matched.route.module, props));
    scrollTo(0, 0);
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = (event.target as Element).closest("a");
    if (!anchor || anchor.hasAttribute("download")) return;
    if (anchor.target && anchor.target !== "_self") return;

    const to = new URL(anchor.href, location.href);
    if (to.origin !== location.origin) return;
    if (to.pathname === location.pathname && to.search === location.search && to.hash) return;

    event.preventDefault();
    navigate(to, true);
  });

  window.addEventListener("popstate", () => {
    navigate(new URL(location.href), false);
  });
}
