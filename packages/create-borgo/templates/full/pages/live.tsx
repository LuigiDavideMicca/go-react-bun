import { useEffect, useRef, useState } from "react";
import { subscribe, type Channel } from "borgo-framework";

export const head = { title: "Live · {{name}}" };

export default function Live() {
  const [log, setLog] = useState<string[]>([]);
  const [present, setPresent] = useState(0);
  const [text, setText] = useState("");
  const channel = useRef<Channel<"live"> | null>(null);

  useEffect(() => {
    // typed events: "note-created" comes from borgo.PushT in go via borgogen,
    // "message" from ws-events.d.ts - checking the event narrows the data
    const ch = subscribe("live", (event, data) => {
      if (event === "__count") setPresent(data);
      else if (event === "message") setLog((l) => [...l, `chat · ${data}`]);
      else if (event === "note-created") setLog((l) => [...l, `go · note "${data}" created`]);
    });
    channel.current = ch;
    return () => ch.close();
  }, []);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    channel.current?.publish("message", text.trim());
    setText("");
  };

  return (
    <main>
      <h1>Live</h1>
      <p>
        A WebSocket channel on the front server. Open this page in two tabs: messages relay between
        browsers, and adding a note on the home page arrives here from Go via{" "}
        <code>borgo.PushT</code>.
      </p>
      <p>
        {present} {present === 1 ? "tab" : "tabs"} connected
      </p>
      <form onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something" />
        <button>Send</button>
      </form>
      <ul>
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </main>
  );
}
