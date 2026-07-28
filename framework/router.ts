import type { ComponentType } from "react";

export type LoaderContext = { params: Record<string, string>; api: string };

export type PageModule = {
  default: ComponentType<any>;
  loader?: (ctx: LoaderContext) => Promise<Record<string, unknown>>;
};

export type Route = { pattern: string; module: PageModule };

// pages/index.tsx -> /, pages/about.tsx -> /about, pages/tasks/[id].tsx -> /tasks/:id
export function filePathToPattern(file: string): string {
  const cleaned = file
    .replace(/\.tsx$/, "")
    .replace(/\[(\w+)\]/g, ":$1")
    .replace(/(^|\/)index$/, "");
  return "/" + cleaned.replace(/^\//, "");
}

export function matchRoute(pathname: string, routes: Route[]) {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const route of routes) {
    const params = matchPattern(route.pattern, path);
    if (params) return { route, params };
  }
  return null;
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
