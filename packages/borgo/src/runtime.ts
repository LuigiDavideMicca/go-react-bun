// browser runtime: react is injected by the generated client entry so it
// always comes from the app's own node_modules
import type { createElement as CreateElement } from "react";
import type { hydrateRoot as HydrateRoot, Root } from "react-dom/client";
import { matchRoute, resolveHead, type Head, type LayoutModule, type PageModule } from "./router";

declare global {
  interface Window {
    __PROPS__?: Record<string, unknown>;
    __BORGO_TITLE__?: string;
    __BORGO_DEV__?: number;
  }
}

// the client-side page module: loader and action are stripped at build time
export type ClientPageModule = Omit<PageModule, "loader" | "action">;

export type ClientRoute = {
  pattern: string;
  file: string;
  hydrate: true | "visible";
  load: () => Promise<ClientPageModule>;
  layouts: LayoutModule[];
};

function showOverlay(title: string, detail: string) {
  document.getElementById("borgo-overlay")?.remove();
  const el = document.createElement("div");
  el.id = "borgo-overlay";
  el.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:rgba(34,27,22,.97);color:#f5ead9;" +
    "font-family:ui-monospace,monospace;overflow:auto;padding:3rem 1.5rem";
  const pre = document.createElement("pre");
  pre.textContent = detail;
  pre.style.cssText =
    "background:#1a140f;border:1px solid #3d2f24;border-radius:8px;padding:1rem;" +
    "white-space:pre-wrap;line-height:1.5;max-width:56rem;margin:0 auto";
  const header = document.createElement("div");
  header.innerHTML =
    '<div style="max-width:56rem;margin:0 auto 1rem">' +
    '<div style="color:#d9825f;font-weight:bold">⌂ borgo</div>' +
    `<h1 style="font-size:1.2rem;color:#e8a07e;margin:.5rem 0">${title}</h1>` +
    '<button style="position:absolute;top:1rem;right:1.5rem;background:none;border:1px solid #3d2f24;color:#b5a08f;border-radius:6px;padding:.3rem .8rem;cursor:pointer" onclick="this.closest(\'#borgo-overlay\').remove()">dismiss</button></div>';
  el.append(header, pre);
  document.body.appendChild(el);
}

function attachDevOverlay() {
  window.addEventListener("error", (event) => {
    showOverlay("client error", event.error?.stack ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    showOverlay("unhandled rejection", reason?.stack ?? String(reason));
  });
}

export type MountOptions = {
  createElement: typeof CreateElement;
  hydrateRoot: typeof HydrateRoot;
  routes: ClientRoute[];
  notFound: ClientRoute | null;
};

function compose(
  createElement: MountOptions["createElement"],
  route: ClientRoute,
  module: ClientPageModule,
  props: Record<string, unknown>,
) {
  let element = createElement(module.default, props);
  for (let i = route.layouts.length - 1; i >= 0; i--) {
    element = createElement(route.layouts[i].default, null, element);
  }
  return element;
}

export function mount({ createElement, hydrateRoot, routes, notFound }: MountOptions) {
  if (window.__BORGO_DEV__) attachDevOverlay();

  const initial = matchRoute(location.pathname, routes);
  const initialRoute = initial?.route ?? notFound;
  if (!initialRoute) return;

  const container = document.getElementById("root")!;
  let root: Root;

  async function hydrate(route: ClientRoute) {
    const module = await route.load();
    root = hydrateRoot(container, compose(createElement, route, module, window.__PROPS__ ?? {}));
    attachNavigation();
  }

  if (initialRoute.hydrate === "visible") {
    const target = document.querySelector("[data-borgo-visible]") ?? container;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        hydrate(initialRoute);
      }
    });
    observer.observe(target);
  } else {
    hydrate(initialRoute);
  }

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

    let module: ClientPageModule;
    let props: Record<string, unknown>;
    try {
      const sep = to.search ? "&" : "?";
      const [loaded, res] = await Promise.all([
        matched.route.load(),
        fetch(to.pathname + to.search + sep + "__borgo=props", {
          headers: { Accept: "application/json" },
        }),
      ]);
      if (!res.ok) throw new Error(`props fetch failed: ${res.status}`);
      module = loaded;
      props = (await res.json()).props ?? {};
    } catch {
      location.assign(to.href);
      return;
    }

    if (push) history.pushState(null, "", to.pathname + to.search + to.hash);
    root.render(compose(createElement, matched.route, module, props));
    applyHead(resolveHead(module, props));
    scrollTo(0, 0);
  }

  function attachNavigation() {
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
}
