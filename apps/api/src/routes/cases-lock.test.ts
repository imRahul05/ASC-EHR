import { describe, expect, it } from "vitest";
import { forFacility } from "@asc/api-client/server";
import { facilityGrant, FakeIdentityPort, staffPrincipal, TEST_TENANT } from "@asc/authz/testing";
import { StaticTenantResolver, type IdentityPort } from "@asc/authz";
import { createTenantDb, withPostgresFacilityLock, type TenantDb } from "@asc/db";

import { buildApp } from "../app.js";
import { buildTestApp, memoryAudit } from "../testing/test-app.js";
import { CasesMockClient as MockClient } from "../testing/mock-medplum.js";
import { createInMemorySchedulingLock } from "./cases.js";

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const futureInstant = (offsetHours = 24) =>
  new Date(Date.now() + offsetHours * 3600 * 1000).toISOString();

describe("Cases distributed locking", () => {
  it("fails startup in production when distributed scheduling lock is unavailable", async () => {
    const audit = memoryAudit();
    // A non-Fake identity port that passes assertIdentityAllowed in production
    const productionIdentity: IdentityPort = {
      authenticate: () => Promise.resolve({ ok: false, reason: "invalid-token" }),
    };

    await expect(
      buildApp({
        corsOrigins: [],
        rateLimit: { ipMax: 10_000, userMax: 10_000, windowMs: 60_000 },
        tenantResolver: new StaticTenantResolver(TEST_TENANT),
        identity: productionIdentity,
        audit,
        catalogVersion: "test-sha",
        production: true,
        tenantDb: undefined,
        facilityRegistrationLock: createInMemorySchedulingLock(),
        facilitySchedulingLock: undefined,
      }),
    ).rejects.toThrow(
      "Distributed scheduling lock (tenantDb or facilitySchedulingLock) is required in production",
    );
  });

  it("throws when tenantId is omitted in postgres scheduling lock wrapper", async () => {
    const audit = memoryAudit();
    const identity = new FakeIdentityPort();
    const mockTenantDb: TenantDb = {
      withTenant: () => Promise.reject(new Error("Unreachable in test")),
    };

    const app = await buildApp({
      corsOrigins: [],
      rateLimit: { ipMax: 10_000, userMax: 10_000, windowMs: 60_000 },
      tenantResolver: new StaticTenantResolver(TEST_TENANT),
      identity,
      audit,
      catalogVersion: "test-sha",
      production: false,
      tenantDb: mockTenantDb,
      facilityRegistrationLock: undefined,
      facilitySchedulingLock: undefined,
    });

    try {
      expect(app.facilitySchedulingLock).toBeDefined();
      if (!app.facilitySchedulingLock) return;

      await expect(
        app.facilitySchedulingLock.withLock("fac-a", () => Promise.resolve("ok"), ""),
      ).rejects.toThrow("Tenant ID is required for distributed facility scheduling lock");
    } finally {
      await app.close();
    }
  });

  describe("createInMemorySchedulingLock", () => {
    it("serializes concurrent operations targeting the same facility", async () => {
      const lock = createInMemorySchedulingLock();
      const timeline: string[] = [];

      const op1 = () =>
        lock.withLock("fac-serial", async () => {
          timeline.push("op1:start");
          await new Promise((resolve) => setTimeout(resolve, 30));
          timeline.push("op1:end");
          return "res1";
        });

      const op2 = () =>
        lock.withLock("fac-serial", async () => {
          timeline.push("op2:start");
          await Promise.resolve();
          timeline.push("op2:end");
          return "res2";
        });

      const [r1, r2] = await Promise.all([op1(), op2()]);

      expect(r1).toBe("res1");
      expect(r2).toBe("res2");
      expect(timeline).toEqual(["op1:start", "op1:end", "op2:start", "op2:end"]);
    });

    it("allows operations targeting different facilities to execute concurrently", async () => {
      const lock = createInMemorySchedulingLock();
      const timeline: string[] = [];

      const opA = () =>
        lock.withLock("fac-a", async () => {
          timeline.push("opA:start");
          await new Promise((resolve) => setTimeout(resolve, 30));
          timeline.push("opA:end");
          return "resA";
        });

      const opB = () =>
        lock.withLock("fac-b", async () => {
          timeline.push("opB:start");
          await Promise.resolve();
          timeline.push("opB:end");
          return "resB";
        });

      const [rA, rB] = await Promise.all([opA(), opB()]);

      expect(rA).toBe("resA");
      expect(rB).toBe("resB");
      expect(timeline).toEqual(["opA:start", "opB:start", "opB:end", "opA:end"]);
    });

    it("recovers and unblocks subsequent queued operations when an in-flight operation throws", async () => {
      const lock = createInMemorySchedulingLock();
      let secondRan = false;

      const failingOp = () =>
        lock.withLock("fac-err", async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error("simulated failure");
        });

      const succeedingOp = () =>
        lock.withLock("fac-err", async () => {
          await Promise.resolve();
          secondRan = true;
          return "ok";
        });

      const results = await Promise.allSettled([failingOp(), succeedingOp()]);

      expect(results[0]?.status).toBe("rejected");
      expect(results[1]?.status).toBe("fulfilled");
      if (results[1]?.status === "fulfilled") {
        expect(results[1].value).toBe("ok");
      }
      expect(secondRan).toBe(true);
    });
  });

  it("two independent Fastify app instances sharing a distributed lock serialize concurrent booking requests", async () => {
    const sharedLock = createInMemorySchedulingLock();
    const mockMedplum = new MockClient();

    // Seed patients into the shared Medplum store
    await forFacility(mockMedplum, "fac-shared").create({
      resourceType: "Patient",
      id: "pat-multi-1",
      name: [{ family: "Alpha", given: ["Alex"] }],
      birthDate: "1985-05-05",
    });

    await forFacility(mockMedplum, "fac-shared").create({
      resourceType: "Patient",
      id: "pat-multi-2",
      name: [{ family: "Beta", given: ["Betty"] }],
      birthDate: "1988-08-08",
    });

    // Create Instance 1
    const instance1 = await buildTestApp({
      medplumBaseUrl: "http://localhost:8203/",
      createMedplumClient: () => mockMedplum,
      facilitySchedulingLock: sharedLock,
    });

    // Create Instance 2
    const instance2 = await buildTestApp({
      medplumBaseUrl: "http://localhost:8203/",
      createMedplumClient: () => mockMedplum,
      facilitySchedulingLock: sharedLock,
    });

    try {
      const principal = staffPrincipal(
        [facilityGrant("fac-shared", ["front-desk"], ["schedule.manage"])],
        "fd-staff-shared",
      );
      instance1.identity.addToken("token-inst-1", principal);
      instance2.identity.addToken("token-inst-2", principal);

      const scheduledAt = futureInstant(72);

      // Concurrent booking requests sent to two separate Fastify app instances for the same room and time
      const [res1, res2] = await Promise.all([
        instance1.app.inject({
          method: "POST",
          url: "/cases",
          headers: bearer("token-inst-1"),
          payload: {
            facilityId: "fac-shared",
            patientId: "pat-multi-1",
            roomId: "room-2",
            scheduledAt,
            durationMinutes: 45,
            primaryPhysicianId: "doc-surgeon-1",
            procedureIntent: "screening",
            primaryProcedureCode: "45378",
          },
        }),
        instance2.app.inject({
          method: "POST",
          url: "/cases",
          headers: bearer("token-inst-2"),
          payload: {
            facilityId: "fac-shared",
            patientId: "pat-multi-2",
            roomId: "room-2",
            scheduledAt,
            durationMinutes: 45,
            primaryPhysicianId: "doc-surgeon-2",
            procedureIntent: "diagnostic",
            primaryProcedureCode: "43239",
          },
        }),
      ]);

      const statuses = [res1.statusCode, res2.statusCode].sort();
      // Exactly one succeeds with 201 Created and the other is rejected with 409 Conflict
      expect(statuses).toEqual([201, 409]);
    } finally {
      await instance1.app.close();
      await instance2.app.close();
    }
  });

  const testDbUrl = process.env.TEST_DATABASE_URL;

  describe.skipIf(!testDbUrl)("PostgreSQL facility scheduling lock cross-connection serialization", () => {
    it("two independent connections serialize execution with withPostgresFacilityLock", async () => {
      const tenantDb = createTenantDb({ url: testDbUrl!, max: 5 });
      const executionOrder: string[] = [];
      const facilityId = "fac-real-pg";
      const tenantId = "11111111-1111-1111-1111-111111111111";

      try {
        const op1 = withPostgresFacilityLock(tenantDb, tenantId, facilityId, async () => {
          executionOrder.push("op1:start");
          await new Promise((resolve) => setTimeout(resolve, 50));
          executionOrder.push("op1:end");
          return "res1";
        });

        const op2 = withPostgresFacilityLock(tenantDb, tenantId, facilityId, async () => {
          await Promise.resolve();
          executionOrder.push("op2:start");
          executionOrder.push("op2:end");
          return "res2";
        });

        const [r1, r2] = await Promise.all([op1, op2]);
        expect(r1).toBe("res1");
        expect(r2).toBe("res2");
        expect(executionOrder).toEqual(["op1:start", "op1:end", "op2:start", "op2:end"]);
      } finally {
        await tenantDb.close();
      }
    });
  });
});
