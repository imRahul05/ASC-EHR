import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../testing/test-app.js";

let app: Awaited<ReturnType<typeof buildTestApp>>["app"] | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("security headers", () => {
  it("sends helmet's headers and never X-Powered-By", async () => {
    ({ app } = await buildTestApp());
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["strict-transport-security"]).toContain("max-age=");
    expect(response.headers["x-frame-options"]).toBeDefined();
    expect(response.headers["content-security-policy"]).toBeDefined();
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("rate limiting", () => {
  it("answers 429 once the address exceeds its budget, with a generic body", async () => {
    ({ app } = await buildTestApp({ rateLimit: { ipMax: 3, userMax: 1000, windowMs: 60_000 } }));
    const statuses: number[] = [];
    let last: { statusCode: number; json: () => unknown; headers: Record<string, unknown> } | undefined;
    for (let i = 0; i < 5; i += 1) {
      last = await app.inject({ method: "GET", url: "/health", remoteAddress: "203.0.113.57" });
      statuses.push(last.statusCode);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(last?.json()).toMatchObject({ code: "rate_limited" });
    expect(JSON.stringify(last?.json())).not.toContain("203.0.113.57");
    expect(last?.headers["retry-after"]).toBeDefined();
  });

  it("budgets each address separately", async () => {
    ({ app } = await buildTestApp({ rateLimit: { ipMax: 1, userMax: 1000, windowMs: 60_000 } }));
    const first = await app.inject({ method: "GET", url: "/health", remoteAddress: "203.0.113.1" });
    const second = await app.inject({ method: "GET", url: "/health", remoteAddress: "203.0.113.2" });
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
  });
});
