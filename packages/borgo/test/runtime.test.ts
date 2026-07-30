import { describe, expect, test } from "bun:test";

// runtime.ts reads location.origin at call time; the pure helpers it exports
// are testable with a stub, the rest of the file needs a real dom (e2e)
(globalThis as { location?: unknown }).location = { origin: "https://app.test" };

const { asProps, redirectUrl } = await import("../src/runtime");

describe("redirectUrl", () => {
  test("resolves relative and absolute same-origin targets", () => {
    expect(redirectUrl("/tasks")?.href).toBe("https://app.test/tasks");
    expect(redirectUrl("https://app.test/a?b=1")?.href).toBe("https://app.test/a?b=1");
  });

  test("keeps cross-origin http targets, the caller decides", () => {
    expect(redirectUrl("https://other.test/x")?.origin).toBe("https://other.test");
  });

  test("rejects script-bearing schemes: location.assign would run them", () => {
    expect(redirectUrl("javascript:alert(1)")).toBeNull();
    expect(redirectUrl("JavaScript:alert(1)")).toBeNull();
    expect(redirectUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(redirectUrl("blob:https://app.test/abc")).toBeNull();
    expect(redirectUrl("vbscript:msgbox")).toBeNull();
  });

  test("rejects malformed values instead of throwing", () => {
    expect(redirectUrl("http://")).toBeNull();
    expect(redirectUrl("")).not.toBeNull(); // empty resolves to the origin root
  });
});

describe("asProps", () => {
  test("passes objects through", () => {
    const props = { a: 1 };
    expect(asProps(props)).toBe(props);
  });

  test("replaces anything createElement cannot spread", () => {
    expect(asProps("nope")).toEqual({});
    expect(asProps([1, 2])).toEqual({});
    expect(asProps(null)).toEqual({});
    expect(asProps(undefined)).toEqual({});
    expect(asProps(7)).toEqual({});
  });
});
