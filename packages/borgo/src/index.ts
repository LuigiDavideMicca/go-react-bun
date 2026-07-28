// everything exported here is browser-safe: pages import from "borgo" and
// end up in the client bundle. server-only entry points live in borgo/server.
export { filePathToPattern, matchRoute, resolveHead } from "./router";
export type {
  ActionContext,
  Head,
  LayoutModule,
  LoaderContext,
  PageModule,
  Route,
} from "./router";

export const redirect = (to: string, status = 303) =>
  new Response(null, { status, headers: { Location: to } });
