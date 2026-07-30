// browser-published events on websocket topics, declared by hand; go-pushed
// events (borgo.PushT) land in .borgo/api-types.d.ts via borgogen
declare module "borgo-framework" {
  interface WsEvents {
    "live/message": string;
  }
}

export {};
