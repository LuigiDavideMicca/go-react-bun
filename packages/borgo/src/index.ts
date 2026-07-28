// everything exported here is browser-safe: pages import from "borgo" and
// end up in the client bundle. server-only entry points live in borgo/server.
export { filePathToPattern, matchRoute, resolveHead } from "./router";
export type {
  ActionContext,
  Head,
  HydrateMode,
  LayoutModule,
  LoaderContext,
  PageModule,
  Route,
} from "./router";
export { ApiError } from "./api";
export type { ApiClient, ApiOptions, ApiRequest, ApiResponse, ApiRouteKey } from "./api";

// route pattern -> response type, filled in by the generated
// .borgo/api-types.d.ts through declaration merging
export interface ApiRoutes {}

export const redirect = (to: string, status = 303) =>
  new Response(null, { status, headers: { Location: to } });

// islands: components in islands/*.tsx that hydrate independently, so a
// hydrate=false page can still have interactive parts. react is injected at
// registration time so this package never bundles its own copy.
import type { ComponentType } from "react";
import type { createElement as CreateElement } from "react";

export type IslandProps = {
  name: string;
  props?: Record<string, unknown>;
  client?: "load" | "visible";
};

let islandRegistry: {
  components: Record<string, ComponentType<any>>;
  createElement: typeof CreateElement;
} | null = null;

export function registerIslands(
  components: Record<string, ComponentType<any>>,
  createElement: typeof CreateElement,
) {
  islandRegistry = { components, createElement };
}

export function Island({ name, props = {}, client = "load" }: IslandProps) {
  if (!islandRegistry) {
    throw new Error("no islands registered - <Island> needs a component in islands/");
  }
  const component = islandRegistry.components[name];
  if (!component) {
    throw new Error(`unknown island "${name}" - expected islands/${name}.tsx`);
  }
  const h = islandRegistry.createElement;
  return h(
    "div",
    {
      "data-borgo-island": name,
      "data-borgo-props": JSON.stringify(props),
      "data-borgo-client": client,
    },
    h(component, props),
  );
}
