import { useState } from "react";

export default function Home() {
  const [message, setMessage] = useState("");

  const greet = async () => {
    const res = await fetch("/api/hello");
    setMessage((await res.json()).message);
  };

  return (
    <main>
      <h1>Welcome to borgo</h1>
      <p>React pages server-rendered by Bun, API routes written in Go.</p>
      <button onClick={greet}>Call the Go API</button>
      {message && <p>{message}</p>}
      <p>
        <a href="/hello/world">SSR with a loader</a> · <a href="/about">About</a>
      </p>
    </main>
  );
}
