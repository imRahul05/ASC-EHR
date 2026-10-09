import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";

type Built = Awaited<ReturnType<typeof buildTestApp>>;
let built: Built | undefined;

afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

async function setup({ medplumBaseUrl }: { medplumBaseUrl: string | undefined } = { medplumBaseUrl: "http://localhost:8203/" }) {
  built = await buildTestApp({ medplumBaseUrl });
  const { app, identity } = built;
  identity.addToken("rn-at-a", staffPrincipal([facilityGrant("A", ["rn"], ["case.read"])], "rn-a"));
  identity.addToken("rn-at-b", staffPrincipal([facilityGrant("B", ["rn"], ["case.read"])], "rn-b"));
  app.get("/probe", { config: { auth: { mode: "authenticated" } } }, (request) => {
    const first = request.medplum;
    return { token: first.getAccessToken(), baseUrl: first.getBaseUrl(), sameClient: request.medplum === first };
  });
  app.get("/public-probe", { config: { auth: { mode: "public" } } }, (request) => ({ token: request.medplum.getAccessToken() }));
  return built;
}

describe("request.medplum (P04 T3)", () => {
  it("acts as the signed-in user with their own token, one client per request", async () => {
    const { app } = await setup();
    const a = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer rn-at-a" } });
    const b = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer rn-at-b" } });
    expect(a.json()).toEqual({ token: "rn-at-a", baseUrl: "http://localhost:8203/", sameClient: true });
    expect(b.json()).toMatchObject({ token: "rn-at-b" });
  });

  it("is never available on a public route: there is no user to act for", async () => {
    const { app } = await setup();
    expect((await app.inject({ method: "GET", url: "/public-probe" })).statusCode).toBe(500);
  });

  it("answers 503 when Medplum is not configured", async () => {
    const { app } = await setup({ medplumBaseUrl: undefined });
    expect((await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer rn-at-a" } })).statusCode).toBe(503);
  });
});

describe("the API has no Medplum identity of its own (#57)", () => {
  const src = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? files(full) : /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
    });

  it("never reads a Medplum client secret or uses the client credentials grant", () => {
    const offenders = files(src).filter((file) => /MEDPLUM_CLIENT_SECRET|MEDPLUM_WORKER_CLIENTS|createClientCredentialsClient|clientSecret|startClientLogin/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
