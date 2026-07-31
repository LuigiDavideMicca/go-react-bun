import { describe, expect, test } from "bun:test";
import {
  createSecurity,
  envInt,
  escapeHtml,
  hasCookie,
  headHtml,
  PROXY_RETRY_MAX_BODY,
  scriptJson,
  shouldBufferBody,
} from "../src/util";

describe("hasCookie", () => {
  test("presence does not depend on the value being usable", () => {
    expect(hasCookie("borgo_csrf=tok", "borgo_csrf")).toBe(true);
    expect(hasCookie("a=1; borgo_csrf=; b=2", "borgo_csrf")).toBe(true);
    // the case the csrf gate turns on: two tossed duplicates read as no
    // token, and the browser must still be treated as one we issued to
    expect(hasCookie("borgo_csrf=aaa; borgo_csrf=bbb", "borgo_csrf")).toBe(true);
  });

  test("exact name match only", () => {
    expect(hasCookie("xborgo_csrf=1", "borgo_csrf")).toBe(false);
    expect(hasCookie("borgo_csrf_extra=1", "borgo_csrf")).toBe(false);
    expect(hasCookie("borgo_session=x", "borgo_csrf")).toBe(false);
  });

  test("missing, empty and malformed headers", () => {
    expect(hasCookie(null, "borgo_csrf")).toBe(false);
    expect(hasCookie("", "borgo_csrf")).toBe(false);
    expect(hasCookie("novalue", "novalue")).toBe(false);
  });
});

describe("scriptJson", () => {
  test("a closing script tag cannot end the block", () => {
    const out = scriptJson({ bio: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ bio: "</script><script>alert(1)</script>" });
  });

  test("an html comment opener cannot switch the parser into escaped state", () => {
    expect(scriptJson({ x: "<!--" })).toBe('{"x":"\\u003c!--"}');
  });

  test("u+2028 and u+2029 leave as escapes, not raw separators", () => {
    const out = scriptJson({ x: "a\u2028b\u2029c" });
    expect(out).toBe('{"x":"a\\u2028b\\u2029c"}');
    expect(JSON.parse(out)).toEqual({ x: "a\u2028b\u2029c" });
  });

  test("keys are escaped like values", () => {
    expect(scriptJson({ "</script>": 1 })).toBe('{"\\u003c/script>":1}');
  });
});

describe("envInt", () => {
  test("unset and empty fall back", () => {
    expect(envInt(undefined, 30_000)).toBe(30_000);
    expect(envInt("", 30_000)).toBe(30_000);
  });

  test("valid values win, zero is a valid value", () => {
    expect(envInt("5000", 30_000)).toBe(5000);
    expect(envInt("0", 30_000)).toBe(0);
    expect(envInt("1.9", 30_000)).toBe(1);
  });

  test("garbage and negatives fall back instead of disabling the limit", () => {
    expect(envInt("banana", 30_000)).toBe(30_000);
    expect(envInt("-1", 30_000)).toBe(30_000);
    expect(envInt("Infinity", 30_000)).toBe(30_000);
    expect(envInt("NaN", 30_000)).toBe(30_000);
  });
});

describe("shouldBufferBody", () => {
  test("buffers small bodies of known size", () => {
    expect(shouldBufferBody("POST", "512")).toBe(true);
    expect(shouldBufferBody("PUT", "0")).toBe(true);
    expect(shouldBufferBody("DELETE", String(PROXY_RETRY_MAX_BODY))).toBe(true);
  });

  test("streams large bodies instead of holding them in memory", () => {
    expect(shouldBufferBody("POST", String(PROXY_RETRY_MAX_BODY + 1))).toBe(false);
    expect(shouldBufferBody("POST", String(500 * 1024 * 1024))).toBe(false);
  });

  test("streams when the size is unknown or garbage", () => {
    expect(shouldBufferBody("POST", null)).toBe(false);
    expect(shouldBufferBody("POST", "not-a-number")).toBe(false);
    expect(shouldBufferBody("POST", "-1")).toBe(false);
  });

  test("bodyless methods never buffer", () => {
    expect(shouldBufferBody("GET", "100")).toBe(false);
    expect(shouldBufferBody("HEAD", "100")).toBe(false);
  });
});

describe("headHtml", () => {
  test("escapes the title, including a closing tag", () => {
    expect(headHtml({ title: "</title><script>alert(1)</script>" })).toBe(
      "<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>",
    );
  });

  test("escapes meta values so a quote cannot open an attribute", () => {
    expect(headHtml({ meta: [{ name: "d", content: '" onload="alert(1)' }] })).toBe(
      '<meta name="d" content="&quot; onload=&quot;alert(1)" data-borgo-head>',
    );
  });

  test("drops attribute names that are not plain names", () => {
    const html = headHtml({
      meta: [{ 'x" onload="alert(1)': "y", "a b": "c", name: "ok" }],
    });
    expect(html).toBe('<meta name="ok" data-borgo-head>');
  });

  test("drops event handler attributes even when well formed", () => {
    expect(headHtml({ meta: [{ onload: "alert(1)", ONERROR: "x", content: "keep" }] })).toBe(
      '<meta content="keep" data-borgo-head>',
    );
  });

  test("non-string values are stringified, not passed through", () => {
    const meta = [{ content: 5 as unknown as string }];
    expect(headHtml({ meta })).toBe('<meta content="5" data-borgo-head>');
  });

  test("an empty head renders nothing", () => {
    expect(headHtml({})).toBe("");
    expect(escapeHtml("a&b<c>d\"e")).toBe("a&amp;b&lt;c&gt;d&quot;e");
  });
});

describe("createSecurity", () => {
  const html = (init?: ResponseInit) =>
    new Response("<p>x</p>", { headers: { "Content-Type": "text/html; charset=utf-8" }, ...init });

  test("production documents get a nonce-carrying csp", () => {
    const security = createSecurity(false)!;
    expect(security.needsNonce).toBe(true);
    const csp = security.cspFor("abc123");
    expect(csp).toContain("script-src 'self' 'nonce-abc123'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain("{nonce}");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  test("dev allows inline scripts instead of minting nonces", () => {
    const security = createSecurity(true)!;
    expect(security.needsNonce).toBe(false);
    const res = security.apply(html());
    expect(res.headers.get("Content-Security-Policy")).toContain(
      "script-src 'self' 'unsafe-inline'",
    );
  });

  test("static headers land on every response, csp only on documents and svg", () => {
    const security = createSecurity(false)!;
    const doc = security.apply(html());
    expect(doc.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(doc.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(doc.headers.get("X-Frame-Options")).toBe("DENY");
    expect(doc.headers.get("Content-Security-Policy")).toContain("script-src 'self'");

    const svg = security.apply(
      new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }),
    );
    expect(svg.headers.get("Content-Security-Policy")).toContain("default-src 'self'");

    const asset = security.apply(
      new Response("body{}", { headers: { "Content-Type": "text/css" } }),
    );
    expect(asset.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(asset.headers.get("Content-Security-Policy")).toBeNull();
  });

  test("a csp already set by the render survives", () => {
    const security = createSecurity(false)!;
    const res = security.apply(
      new Response("<p>x</p>", {
        headers: { "Content-Type": "text/html", "Content-Security-Policy": "mine" },
      }),
    );
    expect(res.headers.get("Content-Security-Policy")).toBe("mine");
  });

  test("BORGO_SECURITY_HEADERS=0 disables everything", () => {
    expect(createSecurity(false, { headers: "0" })).toBeNull();
  });

  test("BORGO_CSP=0 keeps the static headers and drops the policy", () => {
    const security = createSecurity(false, { csp: "0" })!;
    expect(security.needsNonce).toBe(false);
    const res = security.apply(html());
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });

  test("a custom policy replaces the default and can take the nonce", () => {
    const security = createSecurity(false, { csp: "default-src 'self'; script-src 'self'{nonce}" })!;
    expect(security.needsNonce).toBe(true);
    expect(security.cspFor("n1")).toBe("default-src 'self'; script-src 'self' 'nonce-n1'");
    const plain = createSecurity(false, { csp: "default-src *" })!;
    expect(plain.needsNonce).toBe(false);
    expect(plain.apply(html()).headers.get("Content-Security-Policy")).toBe("default-src *");
  });
});
