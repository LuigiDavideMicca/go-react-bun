import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { matchRoute } from "./router";
import { routes } from "./routes.gen";

declare global {
  interface Window {
    __PROPS__?: Record<string, unknown>;
  }
}

const matched = matchRoute(location.pathname, routes);
if (matched) {
  hydrateRoot(
    document.getElementById("root")!,
    createElement(matched.route.module.default, window.__PROPS__ ?? {}),
  );
}
