import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { ClientStorage, MemoryStorage } from "@medplum/core";
import { MockClient as BaseMockClient } from "@medplum/mock";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";

type Built = Awaited<ReturnType<typeof buildTestApp>>;
let built: Built | undefined;

afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("Whiteboard routes", () => {
  describe("GET /whiteboard", () => {
    it("returns 401 when unauthenticated", async () => {
      built = await buildTestApp({ medplumBaseUrl: "http://localhost:8203/" });
      const response = await built.app.inject({
        method: "GET",
        url: "/whiteboard",
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 when user lacks schedule.read capability", async () => {
      const mockMedplum = new BaseMockClient({ storage: new ClientStorage(new MemoryStorage()) });
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      // User with patient.read only (no schedule.read)
      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.read"])],
        "user-no-schedule",
      );
      built.identity.addToken("token-no-sched", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/whiteboard",
        headers: bearer("token-no-sched"),
      });

      expect(response.statusCode).toBe(403);
    });

    it("minimizes server response in TV mode (mode=tv)", async () => {
      const mockMedplum = new BaseMockClient({ storage: new ClientStorage(new MemoryStorage()) });
      const today = new Date().toISOString();

      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Appointment",
        id: "appt-tv-test",
        status: "booked",
        start: today,
        end: new Date(Date.now() + 45 * 60_000).toISOString(),
        description: "Screening Colonoscopy with biopsy",
        participant: [
          { actor: { reference: "Location/room-1" }, status: "accepted" },
          { actor: { reference: "Patient/pat-101" }, status: "accepted" },
          { actor: { reference: "Practitioner/doc-dr-jones" }, status: "accepted" },
        ],
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.read"])],
        "user-sched",
      );
      built.identity.addToken("token-sched", principal);

      // 1. Clinical mode: returns procedure label and clinician details
      const clinicalRes = await built.app.inject({
        method: "GET",
        url: "/whiteboard?mode=clinical",
        headers: bearer("token-sched"),
      });
      expect(clinicalRes.statusCode).toBe(200);
      const clinicalJson = clinicalRes.json();
      expect(clinicalJson.cards.length).toBeGreaterThan(0);
      const clinicalCard = clinicalJson.cards[0];
      expect(clinicalCard.procedureLabel).toBe("Screening Colonoscopy with biopsy");

      // 2. TV mode: server-side strips procedure label, flags, and surgeon initials
      const tvRes = await built.app.inject({
        method: "GET",
        url: "/whiteboard?mode=tv",
        headers: bearer("token-sched"),
      });
      expect(tvRes.statusCode).toBe(200);
      const tvJson = tvRes.json();
      expect(tvJson.cards.length).toBeGreaterThan(0);
      const tvCard = tvJson.cards[0];
      expect(tvCard.procedureLabel).toBe("");
      expect(tvCard.surgeonInitials).toBe("");
      expect(tvCard.flags).toEqual([]);
      // Initials and case number are preserved for kiosk identification
      expect(tvCard.initials).toBeDefined();
      expect(tvCard.caseNumber).toBeDefined();
    });
  });
});
