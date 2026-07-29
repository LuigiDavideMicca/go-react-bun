import { useEffect, useState } from "react";

export const head = { title: "Hydration · borgo tasks" };

// the page chunk is fetched and hydrated only when the marked
// section scrolls into view
export const hydrate = "visible";

export default function Hydration() {
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    (window as unknown as { __hydrated?: boolean }).__hydrated = true;
  }, []);

  return (
    <main>
      <h1>Deferred hydration</h1>
      <p>
        This page exports <code>hydrate = "visible"</code>. The HTML below is
        server-rendered and readable immediately, but no page JavaScript is
        fetched until the interactive section scrolls into view.
      </p>
      <div style={{ height: "150vh" }} aria-hidden>
        <p>Scroll down to wake the page up ↓</p>
      </div>
      <section data-borgo-visible>
        <h2>Now hydrated</h2>
        <button onClick={() => setClicks((c) => c + 1)}>
          clicked {clicks} {clicks === 1 ? "time" : "times"}
        </button>
      </section>
    </main>
  );
}
