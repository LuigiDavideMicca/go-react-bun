# Realtime

Live updates in both directions: server-sent events for one-way feeds, WebSocket topics for anything browsers also write to, and typed event payloads generated from the Go source.

## Server-sent events

`borgo.SSE(w, r)` turns any handler into an event stream — it returns the stream, with `Send(event, data)` (data JSON-encoded), `Ping()` to keep idle proxies from closing it, and `Done()` for the client's disconnect:

```go no-check
//borgo:route GET /api/ticker
func Ticker(w http.ResponseWriter, r *http.Request) {
    stream, err := borgo.SSE(w, r)
    if err != nil {
        return
    }
    for {
        select {
        case tick := <-ticks:
            stream.Send("tick", tick)
        case <-stream.Done():
            return
        }
    }
}
```

`borgo.NewSSEHub()` adds broadcast — `hub.Publish(event, data)` from anywhere, `hub.ServeHTTP` as the route handler. The front server proxies streams without buffering, so an `EventSource` in the browser just works. All stdlib. See the tasks example: create a task in one tab, watch it appear in another.

## WebSocket topics

The Bun front server is also a native WebSocket server. Browsers join named topics with the `subscribe` helper; every `{event, data}` published on a topic reaches every subscriber, including the publisher's other tabs:

```tsx
import { subscribe } from "borgo-framework";

const channel = subscribe("live", (event, data) => { /* ... */ });
channel.publish("message", "hello");   // browser -> everyone on the topic
channel.close();
```

The built-in `__count` event reports the topic's subscriber count (presence for free), and the connection reconnects itself. On the Go side, `borgo.Push(topic, event, data)` publishes into the same topics — it POSTs to the front server's internal endpoint, accepted from loopback. When the two halves are on different hosts, set `FRONT_URL` and the same `BORGO_PUSH_KEY` on both: once a key is set it *replaces* the loopback check, so a key on one side only means every push is refused.

```go
borgo.PushT("live", "task-created", task.Title)
```

## Typed events

`borgo.PushT` is `Push` with the payload visible to static analysis: called with literal topic and event strings, borgogen records the payload type in a generated `"topic/event"` map, exactly like `borgo.JSON[T]` types a route. The `subscribe` callback for that topic then narrows — checking `event` types `data`, and an event name nobody declared fails `tsc`. `channel.publish` is held to the same map: on a topic with declared events, only a declared event name with its payload type compiles (CI proves both directions with deliberate wrong-payload files). Browser-published events join the map through declaration merging in any `.d.ts` of the app (see `ws-events.d.ts` in the tasks example):

```ts
declare module "borgo-framework" {
  interface WsEvents {
    "live/message": string; // browsers publish this one
  }
}
```

Topics with no declared events keep the untyped `(event: string, data: unknown)` callback, and `borgo.Push` stays available for dynamic topic or event names — those simply stay out of the map. One naming rule: a topic passed to `PushT` cannot contain `/` — it would make the `"topic/event"` key ambiguous, and borgogen rejects it at generation time.

### Typing nuances

`Channel.publish` is declared with method syntax on purpose: TypeScript checks method parameters bivariantly, so a typed `Channel<"live">` stays assignable to a plain `Channel` — you can keep a `Channel[]` of mixed topics for cleanup, or pass a typed channel to a helper that only ever calls `close()`. Strict property syntax would reject those assignments; the loosened direction (publishing through the widened reference) is the same escape hatch `borgo.Push` already provides, so nothing new leaks. Wrong payloads through the *typed* reference still fail `tsc`, and CI proves it with deliberate wrong-payload files.

Go itself stays stdlib-only — the WebSocket termination lives where Bun already provides it natively. Choose SSE for one-way server→browser feeds; choose WebSocket topics for anything browsers also write to. The `/live` page in `examples/tasks` demos both directions: two-tab chat plus Go pushes.

The relay itself stays dumb by design: the front server forwards `{event, data}` between subscribers and Go; per-message business logic belongs in Go routes.

## Streams and server timeouts

`borgo.Serve` runs a hardened `http.Server`: `ReadHeaderTimeout` (5s) cuts off slow-header clients, `IdleTimeout` (2m) reclaims kept-alive connections. Read and write timeouts stay `0` by choice — they are wall-clock deadlines on the *whole* request, and any value long enough to be safe for an SSE stream or a streamed SSR response is too long to protect anything; request-body abuse is bounded by `Bind`'s 1 MB cap instead (see [the typed bridge](typed-bridge.md#typed-request-bodies)). WebSockets terminate on the Bun server and never touch Go's timeouts. All four knobs have env overrides (`BORGO_READ_HEADER_TIMEOUT` and friends — see the [environment reference](deploy.md#environment-reference)), and if you do set a write timeout, `borgo.SSE` clears the deadlines on its own connection, so event streams outlive it by design.
