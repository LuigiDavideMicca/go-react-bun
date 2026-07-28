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
