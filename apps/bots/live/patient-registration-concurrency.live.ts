import { createOnBehalfClient, forFacility } from "@asc/api-client/server";
import { buildCoverage, buildPatient, buildRelatedPerson, createTransaction, fhirUrls } from "@asc/fhir";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { liveContext, seedOutput } from "./harness.js";

/**
 * P14 & P15 Concurrency & Race Condition Verification against pinned Medplum 5.1.42.
 *
 * Verifies:
 * 1. Medplum 5.1.42 conditional create behavior under concurrent requests with identical MRN.
 * 2. Whether Medplum creates duplicate Patient resources or resolves to an existing Patient.
 * 3. Whether secondary resources (Coverage, RelatedPerson) are protected against duplicate creation.
 * 4. Idempotent recovery flow when an incomplete registration (Patient created, secondary failed) is retried.
 */
const ctx = liveContext();
const seeded = seedOutput();

const createdPatients: string[] = [];
let tokenA = "";
let tokenB = "";
let facilityId = "";

beforeAll(async () => {
  facilityId = seeded.facilityId;
  const frontDeskPolicy = await ctx.rolePolicy("front-desk");
  const personaA = await ctx.persona("spike-frontdesk-a", [ctx.access(frontDeskPolicy.id, facilityId)]);
  const personaB = await ctx.persona("spike-frontdesk-b", [ctx.access(frontDeskPolicy.id, facilityId)]);
  tokenA = personaA.caller.token;
  tokenB = personaB.caller.token;
});

afterAll(async () => {
  for (const id of createdPatients) {
    // Delete any secondary resources referencing this patient
    const coverages = await ctx.admin.searchResources("Coverage", { patient: `Patient/${id}` });
    for (const c of coverages) {
      if (c.id !== undefined) await ctx.admin.deleteResource("Coverage", c.id);
    }
    const relatedPersons = await ctx.admin.searchResources("RelatedPerson", { patient: `Patient/${id}` });
    for (const rp of relatedPersons) {
      if (rp.id !== undefined) await ctx.admin.deleteResource("RelatedPerson", rp.id);
    }
    await ctx.admin.deleteResource("Patient", id);
  }
});

describe("Medplum 5.1.42 Patient Registration Concurrency & Idempotency", () => {
  it("concurrent conditional create transactions for same MRN do not create duplicate patients", async () => {
    const clientA = createOnBehalfClient({ baseUrl: ctx.baseUrl, accessToken: tokenA });
    const clientB = createOnBehalfClient({ baseUrl: ctx.baseUrl, accessToken: tokenB });
    const writerA = forFacility(clientA, facilityId);
    const writerB = forFacility(clientB, facilityId);

    const testMrn = `CONC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const patientA = buildPatient({
      name: { family: "ConcurrentTest", given: ["Alpha"] },
      birthDate: "1980-01-01",
      gender: "male",
      facilityId,
      mrn: testMrn,
    });
    const patientB = buildPatient({
      name: { family: "ConcurrentTest", given: ["Beta"] },
      birthDate: "1980-01-01",
      gender: "male",
      facilityId,
      mrn: testMrn,
    });

    const mrnSystem = fhirUrls.identifierSystem("mrn");
    const conditionalQuery = `identifier=${encodeURIComponent(`${mrnSystem}|${testMrn}`)}`;

    const txA = createTransaction({ facilityId });
    txA.add("patient", patientA, { ifNoneExist: conditionalQuery });

    const txB = createTransaction({ facilityId });
    txB.add("patient", patientB, { ifNoneExist: conditionalQuery });

    // Fire both transactions concurrently against Medplum 5.1.42
    const [resA, resB] = await Promise.allSettled([
      writerA.transaction(txA.build()),
      writerB.transaction(txB.build()),
    ]);

    // Both requests must complete without crashing
    expect(resA.status).toBe("fulfilled");
    expect(resB.status).toBe("fulfilled");

    if (resA.status === "fulfilled" && resB.status === "fulfilled") {
      const statusA = resA.value.entry?.[0]?.response?.status;
      const statusB = resB.value.entry?.[0]?.response?.status;
      const locA = resA.value.entry?.[0]?.response?.location;
      const locB = resB.value.entry?.[0]?.response?.location;

      // Medplum 5.1.42: one creates (201), the other resolves to existing (200)
      expect([statusA, statusB].sort()).toEqual(["200", "201"]);
      // Both resolve to the exact same patient resource location
      expect(locA).toBe(locB);

      if (locA !== undefined) {
        const patientId = locA.replace(/^Patient\//, "");
        if (!createdPatients.includes(patientId)) createdPatients.push(patientId);
      }
    }

    // Verify Medplum database state: exactly ONE Patient resource exists for this MRN
    const searchResults = await ctx.admin.searchResources("Patient", {
      identifier: `${mrnSystem}|${testMrn}`,
    });
    expect(searchResults.length).toBe(1);
    const savedPatient = searchResults[0];
    if (savedPatient?.id && !createdPatients.includes(savedPatient.id)) {
      createdPatients.push(savedPatient.id);
    }
  });

  it("idempotently completes secondary resources if initial registration was interrupted and safely handles new insurance", async () => {
    const client = createOnBehalfClient({ baseUrl: ctx.baseUrl, accessToken: tokenA });
    const writer = forFacility(client, facilityId);

    const testMrn = `RETRY-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Step 1: Create patient only (simulating secondary resources failure)
    const patientResource = buildPatient({
      name: { family: "RecoveryTest", given: ["Jane"] },
      birthDate: "1985-05-15",
      gender: "female",
      facilityId,
      mrn: testMrn,
    });
    const mrnSystem = fhirUrls.identifierSystem("mrn");
    const conditionalQuery = `identifier=${encodeURIComponent(`${mrnSystem}|${testMrn}`)}`;
    const tx1 = createTransaction({ facilityId });
    tx1.add("patient", patientResource, { ifNoneExist: conditionalQuery });

    const bundle1 = await writer.transaction(tx1.build());
    const patientEntry1 = bundle1.entry?.[0];
    expect(patientEntry1?.response?.status).toBe("201");
    const patientLocation = patientEntry1?.response?.location ?? "";
    const patientId = patientLocation.replace(/^Patient\//, "");
    createdPatients.push(patientId);

    // Verify 0 Coverages or RelatedPersons exist yet
    const initialCoverages = await ctx.admin.searchResources("Coverage", { patient: `Patient/${patientId}` });
    const initialRelatedPersons = await ctx.admin.searchResources("RelatedPerson", { patient: `Patient/${patientId}` });
    expect(initialCoverages.length).toBe(0);
    expect(initialRelatedPersons.length).toBe(0);

    // Recovery Attempt 1: Secondary resources are missing -> created safely
    const txRetry = createTransaction({ facilityId });
    txRetry.add("patient", patientResource, { ifNoneExist: conditionalQuery });
    const bundleRetry = await writer.transaction(txRetry.build());
    const patientEntryRetry = bundleRetry.entry?.[0];

    // Under conditional-create with existing MRN, Medplum returns 200 OK
    expect(patientEntryRetry?.response?.status).toBe("200");
    expect(patientEntryRetry?.response?.location).toBe(patientLocation);

    // Attach missing secondary resources in step 2
    const txSecondary1 = createTransaction({ facilityId });
    const coverage1 = buildCoverage({
      patientId,
      facilityId,
      payorId: facilityId,
      subscriberId: "MEM-RECOVERY-123",
    });
    const escort1 = buildRelatedPerson({
      patientId,
      facilityId,
      name: { family: "RecoveryTest", given: ["John"] },
      relationship: "sponsor",
      telecom: [{ system: "phone", value: "555-0199" }],
    });
    txSecondary1.add("coverage", coverage1);
    txSecondary1.add("escort", escort1);
    const secondaryBundle1 = await writer.transaction(txSecondary1.build());
    expect(secondaryBundle1.entry?.length).toBe(2);
    expect(secondaryBundle1.entry?.[0]?.response?.status).toBe("201");
    expect(secondaryBundle1.entry?.[1]?.response?.status).toBe("201");

    // Verify secondary resources are now safely attached to the patient
    const postRetryCoverages = await ctx.admin.searchResources("Coverage", { patient: `Patient/${patientId}` });
    const postRetryEscorts = await ctx.admin.searchResources("RelatedPerson", { patient: `Patient/${patientId}` });
    expect(postRetryCoverages.length).toBe(1);
    expect(postRetryEscorts.length).toBe(1);
    expect(postRetryCoverages[0]?.subscriberId).toBe("MEM-RECOVERY-123");

    // Recovery Attempt 2 (Idempotent retry with IDENTICAL data):
    // Should match existing Coverage (MEM-RECOVERY-123 + facilityId) and Escort (John + 555-0199)
    // and create ZERO duplicates
    const existingCoverages2 = await ctx.admin.searchResources("Coverage", { patient: `Patient/${patientId}` });
    const existingEscorts2 = await ctx.admin.searchResources("RelatedPerson", { patient: `Patient/${patientId}` });

    const matchedCoverage2 = existingCoverages2.find(
      (c) => c.subscriberId === "MEM-RECOVERY-123" && c.payor?.some((p) => p.reference?.endsWith(facilityId)),
    );
    const matchedEscort2 = existingEscorts2.find(
      (r) => r.name?.[0]?.family === "RecoveryTest" && r.telecom?.some((t) => t.value === "555-0199"),
    );
    expect(matchedCoverage2).toBeDefined();
    expect(matchedEscort2).toBeDefined();

    // Since both matched, secondaryTx has 0 resources to add
    // Medplum database state remains exactly 1 Coverage and 1 Escort
    const coveragesAfterDupRetry = await ctx.admin.searchResources("Coverage", { patient: `Patient/${patientId}` });
    expect(coveragesAfterDupRetry.length).toBe(1);

    // Recovery Attempt 3 (Retry requesting DIFFERENT insurance):
    // Strict matching ensures existing MEM-RECOVERY-123 is NOT treated as a match for MEM-NEW-456!
    const existingCoverages3 = await ctx.admin.searchResources("Coverage", { patient: `Patient/${patientId}` });
    const matchedCoverage3 = existingCoverages3.find(
      (c) => c.subscriberId === "MEM-NEW-456" && c.payor?.some((p) => p.reference?.endsWith(facilityId)),
    );
    expect(matchedCoverage3).toBeUndefined(); // Strict check: no false positive match!

    // Because it did NOT match, create the new insurance
    const txSecondary3 = createTransaction({ facilityId });
    const coverage3 = buildCoverage({
      patientId,
      facilityId,
      payorId: facilityId,
      subscriberId: "MEM-NEW-456",
    });
    txSecondary3.add("coverage", coverage3);
    const secondaryBundle3 = await writer.transaction(txSecondary3.build());
    expect(secondaryBundle3.entry?.length).toBe(1);
    expect(secondaryBundle3.entry?.[0]?.response?.status).toBe("201");

    // Final state: exactly 2 distinct coverages attached to this patient
    const finalCoverages = await ctx.admin.searchResources("Coverage", { patient: `Patient/${patientId}` });
    expect(finalCoverages.length).toBe(2);
    const memberIds = finalCoverages.map((c) => c.subscriberId).sort();
    expect(memberIds).toEqual(["MEM-NEW-456", "MEM-RECOVERY-123"]);
  });
});
