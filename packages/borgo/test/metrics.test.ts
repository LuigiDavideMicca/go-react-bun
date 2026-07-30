import { describe, expect, test } from "bun:test";
import { BUCKETS, createMetrics } from "../src/metrics";

describe("metrics", () => {
  test("counts requests by route and status", () => {
    const m = createMetrics();
    m.observe("/", 200, 0.01);
    m.observe("/", 200, 0.02);
    m.observe("/", 500, 0.3);
    m.observe("/tasks/:id", 200, 0.05);

    const out = m.render();
    expect(out).toContain('borgo_http_requests_total{route="/",status="200"} 2');
    expect(out).toContain('borgo_http_requests_total{route="/",status="500"} 1');
    expect(out).toContain('borgo_http_requests_total{route="/tasks/:id",status="200"} 1');
  });

  test("histogram buckets are cumulative and end with +Inf", () => {
    const m = createMetrics();
    m.observe("/", 200, 0.001);
    m.observe("/", 200, 0.05);
    m.observe("/", 200, 10);

    const out = m.render();
    expect(out).toContain('borgo_http_request_duration_seconds_bucket{route="/",le="0.005"} 1');
    expect(out).toContain('borgo_http_request_duration_seconds_bucket{route="/",le="0.1"} 2');
    expect(out).toContain('borgo_http_request_duration_seconds_bucket{route="/",le="5"} 2');
    expect(out).toContain('borgo_http_request_duration_seconds_bucket{route="/",le="+Inf"} 3');
    expect(out).toContain('borgo_http_request_duration_seconds_count{route="/"} 3');
    const sum = out.match(/borgo_http_request_duration_seconds_sum\{route="\/"\} ([\d.]+)/);
    expect(Number(sum?.[1])).toBeCloseTo(10.051, 3);
  });

  test("uptime gauge counts from the given start", () => {
    const m = createMetrics(Date.now() - 5_000);
    const uptime = m.render().match(/borgo_process_uptime_seconds ([\d.]+)/);
    expect(Number(uptime?.[1])).toBeGreaterThanOrEqual(5);
    expect(Number(uptime?.[1])).toBeLessThan(60);
  });

  test("label values are escaped", () => {
    const m = createMetrics();
    m.observe('/we"ird\\route', 200, 0.01);
    expect(m.render()).toContain('route="/we\\"ird\\\\route"');
  });

  test("series stay bounded", () => {
    const m = createMetrics();
    for (let i = 0; i < 150; i++) m.observe(`/route-${i}`, 200, 0.01);
    const out = m.render();
    expect(out).toContain('route="other"');
    expect(out).not.toContain("/route-120");
  });

  test("type lines make the format parseable", () => {
    const m = createMetrics();
    m.observe("/", 200, 0.01);
    const out = m.render();
    expect(out).toContain("# TYPE borgo_http_requests_total counter");
    expect(out).toContain("# TYPE borgo_http_request_duration_seconds histogram");
    expect(out).toContain("# TYPE borgo_process_uptime_seconds gauge");
    expect(out.endsWith("\n")).toBe(true);
  });
});
