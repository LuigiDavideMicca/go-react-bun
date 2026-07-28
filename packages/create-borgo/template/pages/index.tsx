import { useState } from "react";

export const head = {
  title: "borgo app",
  meta: [{ name: "description", content: "react pages server-rendered by bun, api routes in go" }],
};

export default function Home() {
  const [message, setMessage] = useState("");

  const greet = async () => {
    const res = await fetch("/api/hello");
    setMessage((await res.json()).message);
  };

  return (
    <main className="hero">
      <img src="/logo.svg" alt="borgo" width={120} height={120} />
      <h1>borgo</h1>
      <p className="tagline">React pages server-rendered by Bun · API routes written in Go</p>
      <p className="hint">
        Get started by editing <code>pages/index.tsx</code>
      </p>

      <div className="cards">
        <a className="card" href="/hello/world">
          <h2>SSR with a loader →</h2>
          <p>This page's props are fetched from the Go API on the server, before rendering.</p>
        </a>
        <a className="card" href="/about">
          <h2>About →</h2>
          <p>Navigations are swapped in place by the client runtime, no full reload.</p>
        </a>
        <button className="card" onClick={greet}>
          <h2>Call the Go API</h2>
          <p>
            {message || (
              <>
                Fetch <code>/api/hello</code> straight from the browser.
              </>
            )}
          </p>
        </button>
        <a className="card" href="https://github.com/LuigiDavideMicca/borgo">
          <h2>Docs →</h2>
          <p>Conventions, the roadmap and the whole framework source, small enough to read.</p>
        </a>
      </div>
    </main>
  );
}
