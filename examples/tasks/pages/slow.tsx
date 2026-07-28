import { Suspense, use } from "react";

export const head = { title: "Streaming · borgo tasks" };

// module-level cache so ssr suspends exactly once per process
let slow: Promise<string> | null = null;
const getSlow = () =>
  (slow ??= new Promise((resolve) =>
    setTimeout(() => resolve("this paragraph streamed in after the shell"), 1500),
  ));

function SlowSection() {
  return <p className="streamed">{use(getSlow())}</p>;
}

export default function Slow() {
  return (
    <main>
      <h1>Streaming SSR</h1>
      <p>The shell of this page is sent immediately; the section below suspends on the server and streams in when ready.</p>
      <Suspense fallback={<p className="fallback">loading the slow part…</p>}>
        <SlowSection />
      </Suspense>
    </main>
  );
}
