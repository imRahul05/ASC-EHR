import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";

type TestApp = Awaited<ReturnType<typeof buildTestApp>>["app"];
let app: TestApp | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/**
 * The public surface of the API, spelled out. Adding a public route means editing this
 * list, so the change shows up in review: a public route is reachable without a token.
 * (HEAD is Fastify's automatic twin of a GET route; OPTIONS * is the CORS preflight.)
 */
const EXPECTED_PUBLIC_ROUTES = ["GET /health", "HEAD /health", "OPTIONS *"];

describe("route inventory", () => {
  it("lists exactly the expected public routes", async () => {
    ({ app } = await buildTestApp());
    await app.ready();
    const publicRoutes = app
      .routeAuthInventory()
      .filter((route) => route.auth.mode === "public")
      .map((route) => `${route.method} ${route.url}`)
      .sort();
    expect(publicRoutes).toEqual([...EXPECTED_PUBLIC_ROUTES].sort());
  });

  it("every route declares exactly one of public, authenticated or capability", async () => {
    ({ app } = await buildTestApp());
    await app.ready();
    for (const route of app.routeAuthInventory()) {
      expect(["public", "authenticated", "capability"], `${route.method} ${route.url}`).toContain(route.auth.mode);
    }
  });

  it("records a route added later, so the inventory cannot drift from what is served", async () => {
    ({ app } = await buildTestApp());
    app.get("/_test/added", { config: { auth: { mode: "authenticated" } } }, () => ({}));
    await app.ready();
    expect(app.routeAuthInventory()).toContainEqual({ method: "GET", url: "/_test/added", auth: { mode: "authenticated" } });
  });
});
