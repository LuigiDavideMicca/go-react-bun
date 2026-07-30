import { expect, test } from "@playwright/test";

test("bodies without a known size stream through the api proxy", async () => {
  // a stream body goes out chunked, without content-length: it must take
  // the proxy's streaming branch and still reach the go api intact
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({ title: "streamed body" })));
      controller.close();
    },
  });
  const res = await fetch("http://localhost:3400/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    // @ts-expect-error duplex is required for stream bodies but untyped
    duplex: "half",
  });
  expect(res.status).toBe(201);
  const { task } = (await res.json()) as { task: { ID: number } };
  const cleanup = await fetch(`http://localhost:3400/api/tasks/${task.ID}`, { method: "DELETE" });
  expect(cleanup.status).toBe(200);
});
