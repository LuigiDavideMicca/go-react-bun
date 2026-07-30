import { describe, expect, test } from "bun:test";
import { PROXY_RETRY_MAX_BODY, shouldBufferBody } from "../src/util";

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
