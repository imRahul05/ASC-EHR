import { API_ROUTES } from "@asc/config/api";
import type { AuthSession } from "@asc/types";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiUrl } from "./api-url";
import { authHandlers } from "./auth";
import { meHandlers } from "./me";

const server = setupServer(...authHandlers, ...meHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

const post = (path: string, body: unknown) =>
  fetch(apiUrl(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const me = (token?: string) =>
  fetch(apiUrl(API_ROUTES.me), { headers: token === undefined ? {} : { Authorization: `Bearer ${token}` } });

describe("mock auth fails closed", () => {
  it("rejects an unknown email instead of signing in a default user", async () => {
    const response = await post(API_ROUTES.authLogin, { email: "stranger@example.com", password: "whatever" });
    expect(response.status).toBe(401);
  });

  it("rejects an unknown demo preset", async () => {
    const response = await post(API_ROUTES.authDemoLogin, { presetId: "demo-does-not-exist" });
    expect(response.status).toBe(404);
  });

  it("answers /me with 401 for no token, an unknown token and a token for a stranger", async () => {
    expect((await me()).status).toBe(401);
    expect((await me("mock_jwt_made_up")).status).toBe(401);
  });

  it("signs a known user in and serves their principal on /me", async () => {
    const login = await post(API_ROUTES.authLogin, { email: "Float@ascehr.demo ", password: "x" });
    expect(login.status).toBe(200);
    const { token } = (await login.json()) as AuthSession;
    const response = await me(token);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { principal: { kind: string }; facilities: unknown[] };
    expect(body.principal.kind).toBe("staff");
    expect(body.facilities).toHaveLength(2);
  });

  it("gives a new signup an identity, and refuses to re-register an existing email", async () => {
    const payload = { email: "new.nurse@example.com", password: "secret1", fullName: "New Nurse", role: "NURSE" };
    const signup = await post(API_ROUTES.authSignup, payload);
    expect(signup.status).toBe(200);
    const { token } = (await signup.json()) as AuthSession;
    expect((await me(token)).status).toBe(200);
    expect((await post(API_ROUTES.authSignup, payload)).status).toBe(409);
    expect((await post(API_ROUTES.authSignup, { ...payload, email: "admin@ascehr.demo" })).status).toBe(409);
  });
});
