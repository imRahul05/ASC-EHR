import { facilityGrant, allGrant, staffPrincipal } from "@asc/authz/testing";
import { meResponseSchema } from "@asc/validation";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";

type Built = Awaited<ReturnType<typeof buildTestApp>>;
let built: Built | undefined;

afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("GET /me", () => {
  it("requires a signed-in caller", async () => {
    built = await buildTestApp();
    const response = await built.app.inject({ method: "GET", url: "/me" });
    expect(response.statusCode).toBe(401);
  });

  it("returns the caller's principal and the facilities its grants name, in the shared contract", async () => {
    built = await buildTestApp();
    const principal = staffPrincipal(
      [facilityGrant("A", ["rn"], ["case.read"]), facilityGrant("B", ["gi-physician"], ["note.sign"])],
      "user-9",
    );
    built.identity.addToken("token-9", principal);
    const response = await built.app.inject({ method: "GET", url: "/me", headers: bearer("token-9") });
    expect(response.statusCode).toBe(200);
    const body = meResponseSchema.parse(response.json());
    expect(body.principal).toEqual(principal);
    expect(body.facilities.map((f) => f.id)).toEqual(["A", "B"]);
  });

  it("lists no facilities for an all-site caller and never echoes the token", async () => {
    built = await buildTestApp();
    built.identity.addToken("CANARY-TOKEN", staffPrincipal([allGrant(["admin"], ["admin.users"])], "admin-9"));
    const response = await built.app.inject({ method: "GET", url: "/me", headers: bearer("CANARY-TOKEN") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ facilities: [] });
    expect(response.body).not.toContain("CANARY-TOKEN");
  });

  it("is listed as an authenticated route, not a public one", async () => {
    built = await buildTestApp();
    await built.app.ready();
    expect(built.app.routeAuthInventory()).toContainEqual({ method: "GET", url: "/me", auth: { mode: "authenticated" } });
  });
});
