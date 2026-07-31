import { afterAll, beforeEach, describe, expect, test } from "bun:test";

// subscribe reads location and WebSocket at call time, so stubs are enough;
// location is merged, not replaced: other test files stub their own fields
(globalThis as { location?: unknown }).location = {
  ...((globalThis as { location?: object }).location ?? {}),
  protocol: "http:",
  host: "app.test",
};

class FakeWS {
  static instances: FakeWS[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  send(m: string) {
    this.sent.push(m);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}

const realWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
(globalThis as { WebSocket: unknown }).WebSocket = FakeWS;

const { subscribe } = await import("../src/index");

afterAll(() => {
  (globalThis as { WebSocket: unknown }).WebSocket = realWebSocket;
});

beforeEach(() => {
  FakeWS.instances.length = 0;
});

describe("subscribe", () => {
  test("dispatches only the subscribed topic and survives malformed frames", () => {
    const seen: Array<[string, unknown]> = [];
    const channel = subscribe("chat", (event: string, data: unknown) => seen.push([event, data]));
    const ws = FakeWS.instances[0];
    expect(ws.url).toBe("ws://app.test/ws?topics=chat");
    ws.open();
    ws.onmessage?.({ data: JSON.stringify({ topic: "chat", event: "msg", data: 1 }) });
    ws.onmessage?.({ data: JSON.stringify({ topic: "other", event: "msg", data: 2 }) });
    ws.onmessage?.({ data: "not json{" });
    expect(seen).toEqual([["msg", 1]]);
    channel.close();
  });

  test("publish before open queues and flushes on open", () => {
    const channel = subscribe("chat", () => {});
    const ws = FakeWS.instances[0];
    channel.publish("typed", true);
    expect(ws.sent).toEqual([]);
    ws.open();
    expect(ws.sent).toEqual([JSON.stringify({ topic: "chat", event: "typed", data: true })]);
    channel.close();
  });

  test("a dropped connection reconnects with backoff", () => {
    const captured: Array<() => void> = [];
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) => {
      captured.push(fn);
      return 0;
    }) as unknown as typeof setTimeout;
    try {
      const channel = subscribe("chat", () => {});
      FakeWS.instances[0].close();
      expect(captured.length).toBe(1);
      captured[0]();
      expect(FakeWS.instances.length).toBe(2);
      channel.close();
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
  });

  test("close during the reconnect backoff cancels the redial for good", () => {
    const captured: Array<() => void> = [];
    const cleared: unknown[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = ((fn: () => void) => {
      captured.push(fn);
      return 42;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((id: unknown) => {
      cleared.push(id);
    }) as unknown as typeof clearTimeout;
    try {
      const channel = subscribe("chat", () => {});
      FakeWS.instances[0].close(); // server drops: a reconnect is now pending
      expect(captured.length).toBe(1);
      channel.close();
      expect(cleared).toContain(42);
      // even if the timer had already fired, connect must refuse to dial
      for (const fn of captured) fn();
      expect(FakeWS.instances.length).toBe(1);
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    }
  });

  test("publish after close is dropped, not queued forever", () => {
    const channel = subscribe("chat", () => {});
    const ws = FakeWS.instances[0];
    channel.close();
    channel.publish("late", 1);
    expect(ws.sent).toEqual([]);
  });
});
