/**
 * Worklist Routes Integration Tests (Phase P12)
 *
 * Verifies unified FHIR Task worklist queries, task creation with idempotency,
 * atomic claiming with capability checks and conflict detection, and completion.
 *
 * Regulatory Citations:
 * - CMS 42 CFR § 416.52: Conditions for Coverage - Surgical Services (pre-op timeline).
 * - No Surprises Act 45 CFR § 149.610: Good Faith Estimates delivery.
 * - HIPAA 45 CFR § 164.312(b): Audit controls, technical access, and capability tracking.
 */

import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";
import { CasesMockClient as MockClient } from "../testing/mock-medplum.js";

type Built = Awaited<ReturnType<typeof buildTestApp>>;
let built: Built | undefined;

afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("Worklist Routes", () => {
  describe("GET /worklist", () => {
    it("returns 401 when unauthenticated", async () => {
      built = await buildTestApp({ medplumBaseUrl: "http://localhost:8203/" });
      const response = await built.app.inject({
        method: "GET",
        url: "/worklist?facilityId=fac-a",
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 400 when missing facility context", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });
      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["preop-nurse"], ["case.read"])],
        "user-with-read",
      );
      built.identity.addToken("token-user-with-read", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/worklist",
        headers: bearer("token-user-with-read"),
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("facility_required");
    });

    it("returns 403 when user lacks case.read capability", async () => {
      built = await buildTestApp({ medplumBaseUrl: "http://localhost:8203/" });
      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.read"])],
        "user-no-read",
      );
      built.identity.addToken("token-no-read", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/worklist?facilityId=fac-a",
        headers: bearer("token-no-read"),
      });
      expect(response.statusCode).toBe(403);
    });

    it("returns empty worklist with total: 0 when no tasks exist", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["preop-nurse"], ["case.read", "case.advance"])],
        "user-rn",
      );
      built.identity.addToken("token-rn", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/worklist?facilityId=fac-a",
        headers: bearer("token-rn"),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe("POST /worklist, claim, and complete workflow", () => {
    it("creates, filters, claims, and completes a clinical work item", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      // User with nursing capabilities
      const nursePrincipal = staffPrincipal(
        [facilityGrant("fac-a", ["preop-nurse"], ["case.read", "case.advance", "medhold.review"])],
        "nurse-jenny",
      );
      built.identity.addToken("token-nurse", nursePrincipal);

      // User without medhold.review capability
      const clerkPrincipal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["case.read", "case.advance", "schedule.manage"])],
        "clerk-bob",
      );
      built.identity.addToken("token-clerk", clerkPrincipal);

      const now = new Date();
      const futureDue = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();

      // 1. POST /worklist: Create an urgent anticoagulant review task
      const createRes = await built.app.inject({
        method: "POST",
        url: "/worklist?facilityId=fac-a",
        headers: {
          ...bearer("token-nurse"),
          "Idempotency-Key": "create-task-unique-1",
        },
        payload: {
          type: "med_hold_review",
          title: "Hold Plavix 5 days prior to colonoscopy",
          detail: "Patient on 75mg daily Plavix with prior stent",
          priority: "urgent",
          dueAt: futureDue,
          caseId: "case-999",
          patientId: "pat-123",
          ownerCapability: "medhold.review",
          timelineMilestone: "T-7d",
          idempotencyKey: "med-hold-case-999",
        },
      });

      expect(createRes.statusCode).toBe(201);
      const createdItem = createRes.json();
      expect(createdItem.id).toBeDefined();
      expect(createdItem.type).toBe("med_hold_review");
      expect(createdItem.status).toBe("open");
      expect(createdItem.priority).toBe("urgent");
      expect(createdItem.ownerCapability).toBe("medhold.review");
      expect(createdItem.isOverdue).toBe(false);

      // 2. GET /worklist: Verify item appears in query
      const listRes = await built.app.inject({
        method: "GET",
        url: "/worklist?facilityId=fac-a&type=med_hold_review&status=open",
        headers: bearer("token-nurse"),
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = listRes.json();
      expect(listBody.total).toBe(1);
      expect(listBody.items[0].id).toBe(createdItem.id);

      // 3. Claim failure: clerk attempts to claim but lacks medhold.review capability
      const clerkClaimRes = await built.app.inject({
        method: "POST",
        url: `/worklist/${createdItem.id}/claim?facilityId=fac-a`,
        headers: {
          ...bearer("token-clerk"),
          "Idempotency-Key": "claim-attempt-clerk",
        },
        payload: {
          ownerId: "clerk-bob",
          ownerRole: "ADMIN",
        },
      });
      expect(clerkClaimRes.statusCode).toBe(403);
      expect(clerkClaimRes.json().code).toBe("work_item_capability_denied");

      // 4. Claim success: nurse with medhold.review claims task
      const nurseClaimRes = await built.app.inject({
        method: "POST",
        url: `/worklist/${createdItem.id}/claim?facilityId=fac-a`,
        headers: {
          ...bearer("token-nurse"),
          "Idempotency-Key": "claim-attempt-nurse",
        },
        payload: {
          ownerId: "nurse-jenny",
          ownerRole: "NURSE",
        },
      });
      expect(nurseClaimRes.statusCode).toBe(200);
      const claimedItem = nurseClaimRes.json();
      expect(claimedItem.status).toBe("claimed");
      expect(claimedItem.ownerId).toBe("nurse-jenny");

      // 5. Conflict: second claim by another practitioner returns 409
      const secondNursePrincipal = staffPrincipal(
        [facilityGrant("fac-a", ["preop-nurse"], ["case.read", "case.advance", "medhold.review"])],
        "nurse-sarah",
      );
      built.identity.addToken("token-nurse-2", secondNursePrincipal);

      const conflictClaimRes = await built.app.inject({
        method: "POST",
        url: `/worklist/${createdItem.id}/claim?facilityId=fac-a`,
        headers: {
          ...bearer("token-nurse-2"),
          "Idempotency-Key": "claim-attempt-nurse-2",
        },
        payload: {
          ownerId: "nurse-sarah",
          ownerRole: "NURSE",
        },
      });
      expect(conflictClaimRes.statusCode).toBe(409);
      expect(conflictClaimRes.json().code).toBe("work_item_already_claimed");

      // 6. Complete task: nurse completes task with clinical resolution
      const completeRes = await built.app.inject({
        method: "POST",
        url: `/worklist/${createdItem.id}/complete?facilityId=fac-a`,
        headers: {
          ...bearer("token-nurse"),
          "Idempotency-Key": "complete-attempt-nurse",
        },
        payload: {
          resolvedBy: "nurse-jenny",
          resolution: "Cardiologist clearance obtained; hold Plavix 5 days confirmed.",
        },
      });
      expect(completeRes.statusCode).toBe(200);
      const completedItem = completeRes.json();
      expect(completedItem.status).toBe("completed");
      expect(completedItem.resolvedBy).toBe("nurse-jenny");
      expect(completedItem.resolution).toContain("Cardiologist clearance");

      // 7. Double complete returns 409
      const doubleCompleteRes = await built.app.inject({
        method: "POST",
        url: `/worklist/${createdItem.id}/complete?facilityId=fac-a`,
        headers: {
          ...bearer("token-nurse"),
          "Idempotency-Key": "double-complete-attempt",
        },
        payload: {
          resolution: "Attempting duplicate completion",
        },
      });
      expect(doubleCompleteRes.statusCode).toBe(409);
      expect(doubleCompleteRes.json().code).toBe("work_item_already_completed");
    });

    it("returns 404 when claiming or completing non-existent work item", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["preop-nurse"], ["case.read", "case.advance"])],
        "user-1",
      );
      built.identity.addToken("token-user", principal);

      const claimRes = await built.app.inject({
        method: "POST",
        url: "/worklist/non-existent-task/claim?facilityId=fac-a",
        headers: bearer("token-user"),
        payload: { claimedBy: "user-1" },
      });
      expect(claimRes.statusCode).toBe(404);

      const completeRes = await built.app.inject({
        method: "POST",
        url: "/worklist/non-existent-task/complete?facilityId=fac-a",
        headers: bearer("token-user"),
        payload: { resolvedBy: "user-1", resolution: "Done" },
      });
      expect(completeRes.statusCode).toBe(404);
    });

    it("claims task with empty body defaulting to authenticated principal", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["preop-nurse"], ["case.read", "case.advance"])],
        "nurse-jenny",
      );
      built.identity.addToken("token-nurse", principal);

      // Create item
      const createRes = await built.app.inject({
        method: "POST",
        url: "/worklist?facilityId=fac-a",
        headers: bearer("token-nurse"),
        payload: {
          type: "prep_instructions",
          title: "Deliver prep",
          dueAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });
      const createdItem = createRes.json();

      // Claim with empty body {}
      const claimRes = await built.app.inject({
        method: "POST",
        url: `/worklist/${createdItem.id}/claim?facilityId=fac-a`,
        headers: bearer("token-nurse"),
        payload: {},
      });

      expect(claimRes.statusCode).toBe(200);
      expect(claimRes.json().status).toBe("claimed");
      expect(claimRes.json().ownerId).toBe("nurse-jenny");
    });

    it("rejects with 403 before body validation when user lacks capability (LM-037)", async () => {
      built = await buildTestApp({ medplumBaseUrl: "http://localhost:8203/" });
      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.read"])],
        "user-unauthorized",
      );
      built.identity.addToken("token-unauthorized", principal);

      // Sending completely invalid body to POST /worklist/item-1/claim
      const response = await built.app.inject({
        method: "POST",
        url: "/worklist/item-1/claim?facilityId=fac-a",
        headers: bearer("token-unauthorized"),
        payload: { ownerRole: "INVALID_ROLE_NOT_IN_ENUM" },
      });

      // Must be 403 (capability check runs first), not 400 (validation)
      expect(response.statusCode).toBe(403);
    });
  });
});
