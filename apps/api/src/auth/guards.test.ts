import { allGrant, facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";
import { capabilityAtResource, capabilityRoute } from "./route-auth.js";

type Built = Awaited<ReturnType<typeof buildTestApp>>;
let built: Built | undefined;

afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

const NOT_FOUND = { code: "not_found", message: "Not found." };
const FORBIDDEN = { code: "forbidden", message: "You do not have access to this resource." };
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup(overrides: Parameters<typeof buildTestApp>[0] = {}): Promise<Built> {
  built = await buildTestApp(overrides);
  const { app, identity } = built;
  identity.addToken("rn-at-a", staffPrincipal([facilityGrant("A", ["rn"], ["case.read"])], "rn-a"));
  identity.addToken(
    "rn-a-physician-b",
    staffPrincipal([facilityGrant("A", ["rn"], ["case.read"]), facilityGrant("B", ["gi-physician"], ["note.sign", "case.read"])], "split"),
  );
  identity.addToken("physician-only-b", staffPrincipal([facilityGrant("B", ["gi-physician"], ["note.sign"])], "phys-b"));
  identity.addToken("all-site-admin", staffPrincipal([allGrant(["admin"], ["admin.users", "case.read"])], "admin-1"));
  identity.addToken("no-case-read", staffPrincipal([facilityGrant("A", ["front-desk"], ["patient.read"])], "desk-1"));

  app.get("/facilities/:facilityId/cases", { config: capabilityRoute("case.read", { facilityParam: "facilityId" }) }, () => ({ ok: true }));
  app.post("/facilities/:facilityId/notes", { config: capabilityRoute("note.sign", { facilityParam: "facilityId" }) }, () => ({ signed: true }));
  app.get("/admin/users", { config: capabilityRoute("admin.users") }, () => ({ users: [] }));
  return built;
}

describe("gates 3 and 4: facility and capability", () => {
  it("allows a capability held at the target facility", async () => {
    const { app, audit } = await setup();
    const response = await app.inject({ method: "GET", url: "/facilities/A/cases", headers: bearer("rn-at-a") });
    expect(response.statusCode).toBe(200);
    expect(audit.events).toHaveLength(0);
  });

  it("refuses a facility without a grant: 403, gate 3, audited with the facility and capability", async () => {
    const { app, audit } = await setup();
    const response = await app.inject({ method: "GET", url: "/facilities/B/cases", headers: bearer("rn-at-a") });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(FORBIDDEN);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      action: "auth.denied",
      outcome: "DENIED",
      gate: 3,
      actorId: "rn-a",
      membershipId: "membership-rn-a",
      facilityId: "B",
      details: { reason: "wrong-facility", capability: "case.read" },
    });
  });

  it("does not widen a facility with a role held at another: supervisor-only-at-B, target A is refused", async () => {
    const { app, audit } = await setup();
    // A grant at A exists (rn) but lacks note.sign: gate 4. Holding note.sign at B changes nothing at A.
    const atA = await app.inject({ method: "POST", url: "/facilities/A/notes", headers: bearer("rn-a-physician-b") });
    expect(atA.statusCode).toBe(403);
    expect(audit.events[0]).toMatchObject({ gate: 4, facilityId: "A", details: { reason: "missing-capability", capability: "note.sign" } });
    const atB = await app.inject({ method: "POST", url: "/facilities/B/notes", headers: bearer("rn-a-physician-b") });
    expect(atB.statusCode).toBe(200);
  });

  it("refuses a capability held only at B when the target is A and the caller has no grant at A (gate 3)", async () => {
    const { app, audit } = await setup();
    const response = await app.inject({ method: "POST", url: "/facilities/A/notes", headers: bearer("physician-only-b") });
    expect(response.statusCode).toBe(403);
    expect(audit.events[0]).toMatchObject({ gate: 3, facilityId: "A", details: { reason: "wrong-facility", capability: "note.sign" } });
  });

  it("lets an all-site grant act at any well-formed facility", async () => {
    const { app } = await setup();
    for (const facility of ["A", "B", "facility-99"]) {
      const response = await app.inject({ method: "GET", url: `/facilities/${facility}/cases`, headers: bearer("all-site-admin") });
      expect(response.statusCode, facility).toBe(200);
    }
  });

  it("without a named facility only an all-site grant passes (fail closed)", async () => {
    const { app } = await setup();
    expect((await app.inject({ method: "GET", url: "/admin/users", headers: bearer("all-site-admin") })).statusCode).toBe(200);
    const scoped = await app.inject({ method: "GET", url: "/admin/users", headers: bearer("rn-at-a") });
    expect(scoped.statusCode).toBe(403);
  });

  it("reads the facility only from the route parameter, never from the query string or body", async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/facilities/B/notes?facilityId=A&facility=A",
      headers: { ...bearer("rn-a-physician-b"), "content-type": "application/json", "x-facility-id": "A" },
      payload: { facilityId: "A", facility: { id: "A" } },
    });
    // B is the target and the caller signs at B; the A values are ignored (the reverse would be refused)
    expect(response.statusCode).toBe(200);
    const reverse = await app.inject({
      method: "GET",
      url: "/facilities/B/cases?facilityId=A",
      headers: bearer("rn-at-a"),
    });
    expect(reverse.statusCode).toBe(403);
  });

  it("treats a malformed facility id as no facility and keeps it out of the audit event", async () => {
    const { app, audit } = await setup();
    const hostile = "A%20OR%201%3D1%3B%20--";
    const response = await app.inject({ method: "GET", url: `/facilities/${hostile}/cases`, headers: bearer("rn-at-a") });
    expect(response.statusCode).toBe(403);
    expect(audit.events[0]).toMatchObject({ gate: 3, details: { reason: "wrong-facility" } });
    expect(audit.events[0]).not.toHaveProperty("facilityId");
    expect(JSON.stringify(audit.events)).not.toContain("OR 1");
    const admin = await app.inject({ method: "GET", url: `/facilities/${hostile}/cases`, headers: bearer("all-site-admin") });
    expect(admin.statusCode).toBe(200); // an all-site grant needs no facility; the value is never used
  });

  it("stamps the decision provenance on the denial: role versions, build id and cache state", async () => {
    const { app, audit } = await setup();
    await app.inject({ method: "GET", url: "/facilities/B/cases", headers: bearer("rn-at-a") });
    expect(audit.events[0]?.decision).toEqual({
      roleVersions: [expect.stringMatching(/^rn-v\d+$/)],
      catalogVersion: "test-sha",
      cache: "miss",
    });
  });

  it("still answers the denial, with the same body, when the audit write fails", async () => {
    const { app } = await setup({ audit: { logEvent: () => Promise.reject(new Error("audit store down")) } });
    const response = await app.inject({ method: "GET", url: "/facilities/B/cases", headers: bearer("rn-at-a") });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(FORBIDDEN);
  });
});

describe("resource routes: the facility belongs to a loaded resource", () => {
  const CASES = {
    "case-a1": { tenantId: "tenant-1", facilityId: "A", patientName: "CANARY-PATIENT" },
    "case-b1": { tenantId: "tenant-1", facilityId: "B", patientName: "CANARY-PATIENT" },
    "case-x1": { tenantId: "tenant-2", facilityId: "A", patientName: "CANARY-PATIENT" },
  } as const;

  async function setupResources(): Promise<{ built: Built; handlerCalls: string[] }> {
    const b = await setup();
    const handlerCalls: string[] = [];
    b.app.get<{ Params: { caseId: string } }>("/cases/:caseId", { config: capabilityAtResource("case.read") }, async (request, reply) => {
      handlerCalls.push(request.params.caseId);
      const found = Object.hasOwn(CASES, request.params.caseId) ? CASES[request.params.caseId as keyof typeof CASES] : undefined;
      if (found === undefined) return reply.code(404).send(NOT_FOUND);
      if (!(await b.app.guards.requireSameTenant(request, reply, found.tenantId))) return reply;
      if (!(await b.app.guards.requireCapabilityAt(request, reply, "case.read", found.facilityId))) return reply;
      return { id: request.params.caseId, patientName: found.patientName };
    });
    // A buggy handler that forgets the facility check.
    b.app.get("/cases-unchecked/:caseId", { config: capabilityAtResource("case.read") }, () => ({ patientName: "CANARY-PATIENT" }));
    return { built: b, handlerCalls };
  }

  it("serves a resource at a facility the caller has the capability at", async () => {
    const { built: b } = await setupResources();
    const response = await b.app.inject({ method: "GET", url: "/cases/case-a1", headers: bearer("rn-at-a") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: "case-a1" });
  });

  it("refuses a resource at another facility with 403 (gate 3) and never returns its data", async () => {
    const { built: b } = await setupResources();
    const response = await b.app.inject({ method: "GET", url: "/cases/case-b1", headers: bearer("rn-at-a") });
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain("CANARY-PATIENT");
    expect(b.audit.events[0]).toMatchObject({ gate: 3, facilityId: "B", details: { reason: "wrong-facility", capability: "case.read" } });
  });

  it("answers 404, never data, for a resource id that belongs to another tenant, same as an unknown id", async () => {
    const { built: b } = await setupResources();
    const other = await b.app.inject({ method: "GET", url: "/cases/case-x1", headers: bearer("rn-at-a") });
    const unknown = await b.app.inject({ method: "GET", url: "/cases/does-not-exist", headers: bearer("rn-at-a") });
    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual(NOT_FOUND);
    expect(other.body).toBe(unknown.body);
    expect(other.body).not.toContain("CANARY-PATIENT");
    expect(b.audit.events[0]).toMatchObject({ gate: 1, details: { reason: "policy-denied" } });
  });

  it("refuses a caller who holds the capability nowhere before the handler runs", async () => {
    const { built: b, handlerCalls } = await setupResources();
    const response = await b.app.inject({ method: "GET", url: "/cases/case-a1", headers: bearer("no-case-read") });
    expect(response.statusCode).toBe(403);
    expect(handlerCalls).toHaveLength(0);
  });

  it("turns a handler that skipped the facility check into a 500 with no data", async () => {
    const { built: b } = await setupResources();
    const response = await b.app.inject({ method: "GET", url: "/cases-unchecked/case-b1", headers: bearer("rn-at-a") });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("CANARY-PATIENT");
  });
});
