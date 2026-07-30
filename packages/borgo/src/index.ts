// everything exported here is browser-safe: pages import from "borgo-framework" and
// end up in the client bundle. server-only entry points live in borgo/server.
export { filePathToPattern, matchRoute, resolveHead } from "./router";
export type {
  ActionContext,
  Head,
  HydrateMode,
  LayoutModule,
  LoaderContext,
  PageModule,
  PrerenderContext,
  Route,
} from "./router";
export { ApiError } from "./api";
export type { ApiClient, ApiOptions, ApiRequest, ApiResponse, ApiRouteKey } from "./api";

// route pattern -> response type, filled in by the generated
// .borgo/api-types.d.ts through declaration merging
export interface ApiRoutes {}

export const redirect = (to: string, status = 303) =>
  new Response(null, { status, headers: { Location: to } });

// websocket channels: the front server relays {topic, event, data} between
// every subscriber of a topic; go pushes into the same topics via borgo.Push.
// the built-in "__count" event reports the topic's subscriber count.
// publish is typed against the same WsEvents map as subscribe: a topic with
// declared events only publishes those, with the matching payload; topics
// without declarations (and non-literal topics) keep the untyped shape.
export type Channel<T extends string = string> = {
  publish(...args: PublishArgs<T>): void;
  close(): void;
};

// "topic/event" -> payload type. borgogen fills this in from borgo.PushT
// calls through the generated .borgo/api-types.d.ts; browser-published
// events are declared the same way in any app .d.ts file.
export interface WsEvents {}

type EventsFor<T extends string> = {
  [K in keyof WsEvents & string as K extends `${T}/${infer E}` ? E : never]: WsEvents[K];
};

// a topic with declared events gets a closed, discriminated (event, data)
// pair - checking event narrows data, an undeclared event name fails tsc.
// topics without declarations keep the untyped (string, unknown) shape.
type EventPairs<M> = {
  [E in Extract<keyof M, string>]: [event: E, data: M[E]];
}[Extract<keyof M, string>];

export type TopicEvents<T extends string> = [keyof EventsFor<T>] extends [never]
  ? [event: string, data: unknown]
  : EventPairs<EventsFor<T>> | [event: "__count", data: number];

export type TopicEventName<T extends string> = [keyof EventsFor<T>] extends [never]
  ? string
  : Extract<keyof EventsFor<T>, string> | "__count";

// what a browser may publish: the declared events minus the server-only
// "__count"; same fallback as subscribe when nothing is declared
export type PublishArgs<T extends string> = string extends T
  ? [event: string, data?: unknown]
  : [keyof EventsFor<T>] extends [never]
    ? [event: string, data?: unknown]
    : EventPairs<EventsFor<T>>;

// the second overload keeps single-parameter callbacks compiling: tsc does
// not accept them against a rest signature made of a tuple union
export function subscribe<T extends string>(
  topic: T,
  onEvent: (...args: TopicEvents<T>) => void,
): Channel<T>;
export function subscribe<T extends string>(
  topic: T,
  onEvent: (event: TopicEventName<T>) => void,
): Channel<T>;
export function subscribe(
  topic: string,
  onEvent: (...args: any[]) => void,
): Channel {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempts = 0;
  const queue: string[] = [];

  const connect = () => {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${scheme}://${location.host}/ws?topics=${encodeURIComponent(topic)}`);
    ws.onopen = () => {
      attempts = 0;
      for (const pending of queue.splice(0)) ws!.send(pending);
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.topic === topic) onEvent(msg.event, msg.data);
      } catch {}
    };
    ws.onclose = () => {
      // an unreachable server would otherwise be dialled once a second for as
      // long as the tab stays open; backoff resets on the next successful open
      if (!closed) setTimeout(connect, Math.min(30_000, 1_000 * 2 ** attempts++));
    };
  };
  connect();

  return {
    publish(event, data) {
      const msg = JSON.stringify({ topic, event, data });
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
      else queue.push(msg);
    },
    close() {
      closed = true;
      ws?.close();
    },
  };
}

// islands: components in islands/*.tsx that hydrate independently, so a
// hydrate=false page can still have interactive parts. react is injected at
// registration time so this package never bundles its own copy.
import type { ComponentType, Context } from "react";
import type { createContext as CreateContext, createElement as CreateElement, useContext as UseContext } from "react";

// csrf double-submit: the front server issues a borgo_csrf cookie and, in
// production, requires form actions of session-carrying requests to echo it
// in a hidden field. CsrfField renders that field; the token flows through a
// react context provided by the server render and the client runtime.
export const CSRF_COOKIE = "borgo_csrf";
export const CSRF_FIELD = "__borgo_csrf";

export function cookieValue(header: string | null, name: string): string {
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return "";
}

type CsrfReact = {
  createElement: typeof CreateElement;
  createContext: typeof CreateContext;
  useContext: typeof UseContext;
};

let csrfRuntime: { react: CsrfReact; context: Context<string> } | null = null;

// react is injected (like islands) so this package never bundles its own copy
export function registerCsrf(react: CsrfReact) {
  csrfRuntime = { react, context: react.createContext("") };
}

export function withCsrf(element: import("react").ReactNode, token: string) {
  if (!csrfRuntime) return element;
  const { react, context } = csrfRuntime;
  return react.createElement(context.Provider, { value: token }, element);
}

// <CsrfField /> inside any <form method="post"> - server-rendered with the
// same token the cookie carries, so classic no-js posts pass validation too
export function CsrfField() {
  if (!csrfRuntime) {
    throw new Error("csrf runtime not registered - is the app on a current borgo build?");
  }
  const { react, context } = csrfRuntime;
  const token = react.useContext(context);
  return react.createElement("input", { type: "hidden", name: CSRF_FIELD, value: token });
}

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

// registers a service worker in production only: a dev session held by a
// caching sw is the fastest way to debug ghosts. safe to call from any
// hydrated page or island; no-ops server-side and in unsupported browsers.
export function registerServiceWorker(path = "/sw.js") {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (typeof window !== "undefined" && (window as { __BORGO_DEV__?: number }).__BORGO_DEV__) return;
  const register = () => void navigator.serviceWorker.register(path).catch(() => {});
  if (document.readyState === "complete") register();
  else addEventListener("load", register);
}
