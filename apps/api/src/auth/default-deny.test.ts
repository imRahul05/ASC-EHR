import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";
import { authenticatedRoute, capabilityRoute, publicRoute } from "./route-auth.js";

type TestApp = Awaited<ReturnType<typeof buildTestApp>>["app"];
let app: TestApp | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("default deny", () => {
  it("refuses a route registered without config.auth", async () => {
    ({ app } = await buildTestApp());
    expect(() => app!.get("/_test/forgot", () => ({ ok: true }))).toThrow(/declares no auth/);
  });

  it("names the method and path, so the author finds the route", async () => {
    ({ app } = await buildTestApp());
    expect(() => app!.post("/_test/forgot-too", { config: {} }, () => ({}))).toThrow("Route POST /_test/forgot-too declares no auth");
  });

  it("makes the app fail to start when a plugin registers an undeclared route", async () => {
    ({ app } = await buildTestApp());
    // An async plugin turns the registration error into a rejected `ready()`.
    void app.register(async (instance) => {
      await Promise.resolve();
      instance.get("/_test/from-plugin", () => ({ ok: true }));
    });
    await expect(app.ready()).rejects.toThrow(/declares no auth/);
  });

  it("accepts a route that declares public, authenticated or capability access", async () => {
    ({ app } = await buildTestApp());
    expect(() => {
      app!.get("/_test/a", { config: publicRoute() }, () => ({}));
      app!.get("/_test/b", { config: authenticatedRoute() }, () => ({}));
      app!.get("/_test/c", { config: capabilityRoute("case.read") }, () => ({}));
    }).not.toThrow();
    await expect(app.ready()).resolves.toBeDefined();
  });

  it("starts with the real route set (every shipped route declares auth)", async () => {
    ({ app } = await buildTestApp());
    await expect(app.ready()).resolves.toBeDefined();
  });

  it("answers an undeclared path with 401 to an anonymous caller, so routes cannot be enumerated", async () => {
    ({ app } = await buildTestApp());
    const response = await app.inject({ method: "GET", url: "/admin/everything" });
    expect(response.statusCode).toBe(401);
  });
});
