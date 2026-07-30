import { expect, test } from "@playwright/test";

test("percent-encoded asset paths decode to the real file", async ({ request }) => {
  const res = await request.get("/assets/client%2Ejs");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("javascript");
});

test("encoded traversal attempts never escape public/", async ({ request }) => {
  const attempts = [
    "/assets/%2e%2e/%2e%2e/main.go",
    "/%2e%2e/go.mod",
    "/assets/..%5C..%5Cmain.go",
    "/assets/%2e%2e%5C%2e%2e%5Cgo.mod",
  ];
  for (const path of attempts) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
  }
});

test("head requests carry real status and headers, but no body", async ({ request }) => {
  const ok = await request.head("/");
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toContain("text/html");
  expect((await ok.body()).length).toBe(0);

  const missing = await request.head("/definitely/not/here");
  expect(missing.status()).toBe(404);
});
