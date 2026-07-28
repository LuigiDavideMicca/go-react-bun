import { Island } from "borgo-framework";

export const head = { title: "Islands · borgo tasks" };

// no page bundle at all - only the islands below hydrate, independently
export const hydrate = false;

export default function Islands() {
  return (
    <main>
      <h1>Islands</h1>
      <p>
        This page exports <code>hydrate = false</code>: it ships no page JavaScript and never
        hydrates. The counters are islands from <code>islands/Counter.tsx</code> — each one
        hydrates on its own, the rest of the page stays static HTML.
      </p>
      <Island name="Counter" props={{ label: "Eager island", start: 5 }} />
      <div style={{ height: "120vh" }} aria-hidden>
        <p>Scroll down for an island that hydrates only when visible ↓</p>
      </div>
      <Island name="Counter" props={{ label: "Visible island" }} client="visible" />
    </main>
  );
}
