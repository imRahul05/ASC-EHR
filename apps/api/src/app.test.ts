import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp } from "./testing/test-app.js";

const ALLOWED = "https://app.example.com";

let app: Awaited<ReturnType<typeof buildTestApp>>["app"] | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function preflight(origin: string, corsOrigins: readonly string[]) {
  ({ app } = await buildTestApp({ corsOrigins }));
  return app.inject({
    method: "OPTIONS",
    url: "/health",
    headers: {
      origin,
      "access-control-request-method": "GET",
      "access-control-request-headers": "authorization",
    },
  });
}

describe("CORS", () => {
  it("allows a configured origin, including the Authorization header", async () => {
    const response = await preflight(ALLOWED, [ALLOWED]);
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(response.headers["access-control-allow-headers"]).toContain("Authorization");
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("does not allow an unlisted origin", async () => {
    const response = await preflight("https://evil.example.com", [ALLOWED]);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows no origin when the list is empty", async () => {
    const response = await preflight(ALLOWED, []);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("adds the allow-origin header to simple requests", async () => {
    ({ app } = await buildTestApp({ corsOrigins: [ALLOWED] }));
    const response = await app.inject({ method: "GET", url: "/health", headers: { origin: ALLOWED } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED);
  });
});
