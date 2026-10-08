import type { ClientApplication } from "@medplum/fhirtypes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { jwtClaims, liveContext, userLogin } from "./harness.js";

/**
 * Spike S1, token half (Medplum 5.1.42): which claim carries auth time for step-up, and does the
 * ClientApplication lifetime setting apply. One user login per file (Medplum throttles logins).
 */
const ctx = liveContext();
let user: Awaited<ReturnType<typeof ctx.inviteUser>>;
let webClient: ClientApplication;
let login: Awaited<ReturnType<typeof userLogin>>;
const before = Math.floor(Date.now() / 1000);

beforeAll(async () => {
  const facility = await ctx.facility("A");
  user = await ctx.inviteUser("s1-token", [ctx.access((await ctx.rolePolicy("rn")).id, facility)]);
  const [found] = await ctx.admin.searchResources("ClientApplication", { "name:exact": "spike-s1-web" });
  const wanted: ClientApplication = {
    resourceType: "ClientApplication",
    name: "spike-s1-web",
    redirectUri: "http://localhost:3999/spike/callback",
    pkceOptional: false,
    accessTokenLifetime: "15m",
  };
  webClient = found === undefined ? await ctx.admin.createResource(wanted) : await ctx.admin.updateResource({ ...found, ...wanted });
  login = await userLogin(ctx.baseUrl, { email: user.email, password: user.password }, webClient.id);
});

afterAll(async () => {
  await user.remove();
});

describe("S1 auth time for step-up", () => {
  it("carries auth_time in the id_token, not in the access token", () => {
    const idClaims = jwtClaims(login.idToken ?? "");
    const accessClaims = jwtClaims(login.accessToken);
    expect(typeof idClaims.auth_time).toBe("number");
    expect(Number(idClaims.auth_time)).toBeGreaterThanOrEqual(before - 1);
    expect(accessClaims).not.toHaveProperty("auth_time");
    expect(accessClaims.login_id).toBe(idClaims.login_id);
  });

  it("issues no refresh token for the openid scope, so the access token iat is the sign-in time", () => {
    expect(login.refreshToken).toBeUndefined();
    const idClaims = jwtClaims(login.idToken ?? "");
    const accessClaims = jwtClaims(login.accessToken);
    expect(Math.abs(Number(accessClaims.iat) - Number(idClaims.auth_time))).toBeLessThanOrEqual(1);
  });
});

describe("S1 ClientApplication.accessTokenLifetime", () => {
  it("is honoured: 15m gives a 900 second token, and exp matches", () => {
    expect(login.expiresIn).toBe(900);
    const claims = jwtClaims(login.accessToken);
    expect(Number(claims.exp) - Number(claims.iat)).toBe(900);
  });
});
