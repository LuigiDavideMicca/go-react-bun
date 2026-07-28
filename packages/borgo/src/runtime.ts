// browser runtime: react is injected by the generated client entry so it
// always comes from the app's own node_modules
import type { createElement as CreateElement } from "react";
import type { hydrateRoot as HydrateRoot } from "react-dom/client";
import { matchRoute, type Route } from "./router";

declare global {
  interface Window {
    __PROPS__?: Record<string, unknown>;
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
  const matched = matchRoute(location.pathname, routes);
  const route = matched?.route ?? notFound;
  if (!route) return;

  hydrateRoot(
    document.getElementById("root")!,
    compose(createElement, route, window.__PROPS__ ?? {}),
  );
}
