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

export type MountIslandsOptions = {
  createElement: typeof CreateElement;
  hydrateRoot: typeof HydrateRoot;
  islands: Record<string, import("react").ComponentType<any>>;
};

// hydrates every <Island> marker on a page that itself ships no page bundle
// (hydrate=false); client="visible" defers the work until scrolled into view
export function mountIslands({ createElement, hydrateRoot, islands }: MountIslandsOptions) {
  for (const el of document.querySelectorAll("[data-borgo-island]")) {
    const name = el.getAttribute("data-borgo-island")!;
    const component = islands[name];
    if (!component) continue;
    const props = JSON.parse(el.getAttribute("data-borgo-props") || "{}");
    const hydrate = () => hydrateRoot(el, createElement(component, props));
    if (el.getAttribute("data-borgo-client") === "visible") {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          hydrate();
        }
      });
      observer.observe(el);
    } else {
      hydrate();
    }
  }
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
  let currentRoute: ClientRoute | null = null;

  async function hydrate(route: ClientRoute) {
    const module = await route.load();
    currentRoute = route;
    root = hydrateRoot(container, compose(createElement, route, module, window.__PROPS__ ?? {}));
    attachNavigation();
  }

  if (window.__BORGO_DEV__) attachDevChannel();

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

  // props prefetched on hover are kept briefly and consumed by the next
  // navigation; the route chunk import is idempotent and needs no cache
  const propsTtl = 10_000;
  const propsCache = new Map<string, { promise: Promise<Response>; time: number }>();

  function fetchProps(to: URL) {
    const sep = to.search ? "&" : "?";
    return fetch(to.pathname + to.search + sep + "__borgo=props", {
      headers: { Accept: "application/json" },
    });
  }

  function prefetch(to: URL, withProps: boolean) {
    const matched = matchRoute(to.pathname, routes);
    if (!matched) return;
    matched.route.load();
    if (!withProps) return;
    const cacheKey = to.pathname + to.search;
    const hit = propsCache.get(cacheKey);
    if (hit && performance.now() - hit.time < propsTtl) return;
    const promise = fetchProps(to);
    promise.catch(() => {});
    propsCache.set(cacheKey, { promise, time: performance.now() });
  }

  // scroll restoration: every history entry gets a key, positions are saved
  // to sessionStorage as you scroll and restored on back/forward
  const newKey = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  let entryKey: string = history.state?.__borgo ?? newKey();

  function saveScroll() {
    try {
      sessionStorage.setItem(`borgo:scroll:${entryKey}`, `${scrollX},${scrollY}`);
    } catch {}
  }

  function restoreScroll(key: string) {
    const saved = sessionStorage.getItem(`borgo:scroll:${key}`);
    if (!saved) return scrollTo(0, 0);
    const [x, y] = saved.split(",").map(Number);
    scrollTo(x, y);
  }

  const afterRender = (fn: () => void) =>
    requestAnimationFrame(() => requestAnimationFrame(fn));

  async function navigate(to: URL, push: boolean) {
    const matched = matchRoute(to.pathname, routes);
    if (!matched) {
      location.assign(to.href);
      return;
    }

    let module: ClientPageModule;
    let props: Record<string, unknown>;
    try {
      const cacheKey = to.pathname + to.search;
      const cached = propsCache.get(cacheKey);
      propsCache.delete(cacheKey);
      const propsPromise =
        cached && performance.now() - cached.time < propsTtl ? cached.promise : fetchProps(to);
      const [loaded, res] = await Promise.all([matched.route.load(), propsPromise]);
      if (!res.ok) throw new Error(`props fetch failed: ${res.status}`);
      module = loaded;
      const data = await res.json();
      if (data.redirect) {
        navigate(new URL(data.redirect, location.origin), push);
        return;
      }
      props = data.props ?? {};
    } catch {
      location.assign(to.href);
      return;
    }

    if (push) {
      saveScroll();
      entryKey = newKey();
      history.pushState({ __borgo: entryKey }, "", to.pathname + to.search + to.hash);
    }
    currentRoute = matched.route;
    root.render(compose(createElement, matched.route, module, props));
    applyHead(resolveHead(module, props));
    const key = entryKey;
    afterRender(() => {
      if (push) {
        const target = to.hash && document.getElementById(to.hash.slice(1));
        target ? target.scrollIntoView() : scrollTo(0, 0);
      } else {
        restoreScroll(key);
      }
      observeLinks();
    });
  }

  // same checks as the click handler: internal, same-origin, no download
  function linkTarget(anchor: HTMLAnchorElement | null): URL | null {
    if (!anchor || anchor.hasAttribute("download")) return null;
    if (anchor.target && anchor.target !== "_self") return null;
    const to = new URL(anchor.href, location.href);
    if (to.origin !== location.origin) return null;
    return to;
  }

  // links scrolled into view get their route chunk prefetched
  const seenLinks = new WeakSet<Element>();
  const linkObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      linkObserver.unobserve(entry.target);
      const to = linkTarget(entry.target as HTMLAnchorElement);
      if (to) prefetch(to, false);
    }
  });

  function observeLinks() {
    for (const anchor of document.querySelectorAll("a[href]")) {
      if (seenLinks.has(anchor)) continue;
      seenLinks.add(anchor);
      linkObserver.observe(anchor);
    }
  }

  function attachNavigation() {
    history.scrollRestoration = "manual";
    if (!history.state?.__borgo) {
      history.replaceState({ ...history.state, __borgo: entryKey }, "");
    }
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    addEventListener(
      "scroll",
      () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(saveScroll, 100);
      },
      { passive: true },
    );

    // hover or focus prefetches the chunk and the loader props
    const onIntent = (event: Event) => {
      const anchor = (event.target as Element).closest?.("a");
      const to = anchor && linkTarget(anchor);
      if (to && to.pathname !== location.pathname) prefetch(to, true);
    };
    document.addEventListener("mouseover", onIntent);
    document.addEventListener("focusin", onIntent);
    document.addEventListener("touchstart", onIntent, { passive: true });

    observeLinks();

    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element).closest("a");
      const to = linkTarget(anchor);
      if (!to) return;
      if (to.pathname === location.pathname && to.search === location.search && to.hash) return;

      event.preventDefault();
      navigate(to, true);
    });

    window.addEventListener("popstate", () => {
      entryKey = history.state?.__borgo ?? newKey();
      navigate(new URL(location.href), false);
    });
  }

  // dev channel: fast refresh for the current page, css hot swap, full
  // reload for anything not refreshable (layouts, the shell, go changes)
  function attachDevChannel() {
    // the stamp survives reloads, so a boot's welcome message is applied once
    let lastStamp = Number(sessionStorage.getItem("borgo:devstamp") ?? 0);

    async function applyUpdate(msg: { file: string; chunks: Record<string, string>; stamp: number }) {
      const { file, chunks } = msg;
      if (msg.stamp && msg.stamp <= lastStamp) return;
      lastStamp = msg.stamp;
      try {
        sessionStorage.setItem("borgo:devstamp", String(msg.stamp));
      } catch {}
      if (!/\.tsx$/.test(file) || /(^|\/)_(layout|404|500)\.tsx$/.test(file)) {
        return location.reload();
      }
      for (const route of [...routes, ...(notFound ? [notFound] : [])]) {
        const chunk = chunks[route.file];
        if (chunk) route.load = () => import(chunk);
      }
      if (!currentRoute || !root) return location.reload();
      if (file.startsWith("pages/") && file !== "pages/" + currentRoute.file) return;
      const chunk = chunks[currentRoute.file];
      if (!chunk) return location.reload();
      try {
        const route = currentRoute;
        const [module, res] = await Promise.all([
          import(chunk) as Promise<ClientPageModule>,
          fetchProps(new URL(location.href)),
        ]);
        if (!res.ok) throw new Error(`props fetch failed: ${res.status}`);
        const props = (await res.json()).props ?? {};
        root.render(compose(createElement, route, module, props));
        applyHead(resolveHead(module, props));
        (globalThis as { $RefreshRuntime$?: { performReactRefresh: () => void } }).$RefreshRuntime$?.performReactRefresh();
      } catch {
        location.reload();
      }
    }

    const connect = () => {
      const ws = new WebSocket(`ws://${location.host}/__borgo/dev`);
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "reload") location.reload();
        else if (msg.type === "css") {
          for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
            link.href = link.href.split("?")[0] + "?t=" + Date.now();
          }
        } else if (msg.type === "js") applyUpdate(msg);
      };
      ws.onclose = () => setTimeout(connect, 300);
    };
    connect();
  }
}
