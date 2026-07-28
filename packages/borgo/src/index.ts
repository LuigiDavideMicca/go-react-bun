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
export type Channel = {
  publish: (event: string, data?: unknown) => void;
  close: () => void;
};

export function subscribe(topic: string, onEvent: (event: string, data: unknown) => void): Channel {
  let ws: WebSocket | null = null;
  let closed = false;
  const queue: string[] = [];

  const connect = () => {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${scheme}://${location.host}/ws?topics=${encodeURIComponent(topic)}`);
    ws.onopen = () => {
      for (const pending of queue.splice(0)) ws!.send(pending);
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.topic === topic) onEvent(msg.event, msg.data);
      } catch {}
    };
    ws.onclose = () => {
      if (!closed) setTimeout(connect, 1000);
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
