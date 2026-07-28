import type { ComponentType, ReactNode } from "react";
import type { ApiClient } from "./api";

// api is the typed client for the go routes; apiUrl is the raw base url
// (e.g. http://localhost:3501/api) for anything the client doesn't cover
export type LoaderContext = { params: Record<string, string>; api: ApiClient; apiUrl: string };
export type ActionContext = {
  request: Request;
  params: Record<string, string>;
  api: ApiClient;
  apiUrl: string;
};

export type Head = { title?: string; meta?: Array<Record<string, string>> };

export type HydrateMode = boolean | "visible";

export type PageModule = {
  default: ComponentType<any>;
  loader?: (ctx: LoaderContext) => Promise<Record<string, unknown>>;
  action?: (ctx: ActionContext) => Promise<Response | Record<string, unknown>>;
  head?: Head | ((props: Record<string, unknown>) => Head);
  hydrate?: HydrateMode;
};

export type LayoutModule = {
  default: ComponentType<{ children: ReactNode }>;
};

export type Route = {
  pattern: string;
  file: string;
  module: PageModule;
  layouts: LayoutModule[];
};

// pages/index.tsx -> /, pages/about.tsx -> /about, pages/tasks/[id].tsx -> /tasks/:id
export function filePathToPattern(file: string): string {
  const cleaned = file
    .replace(/\.tsx$/, "")
    .replace(/\[(\w+)\]/g, ":$1")
    .replace(/(^|\/)index$/, "");
  return "/" + cleaned.replace(/^\//, "");
}

export function matchRoute<R extends { pattern: string }>(pathname: string, routes: R[]) {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const route of routes) {
    const params = matchPattern(route.pattern, path);
    if (params) return { route, params };
  }
  return null;
}

export function resolveHead(module: PageModule, props: Record<string, unknown>): Head {
  const head = typeof module.head === "function" ? module.head(props) : module.head;
  return head ?? {};
}

function matchPattern(pattern: string, path: string) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}
