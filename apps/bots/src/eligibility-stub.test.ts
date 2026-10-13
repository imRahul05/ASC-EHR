import type { BotEvent, MedplumClient } from "@medplum/core";
import type { Coverage, Resource } from "@medplum/fhirtypes";
import { describe, expect, it, vi } from "vitest";
import { handler, isInactiveCoverage } from "./eligibility-stub.js";

interface MockMedplumContext {
  readonly client: MedplumClient;
  readonly createdTasks: Resource[];
  readonly createSpy: ReturnType<typeof vi.fn>;
}

function setupMockMedplum(): MockMedplumContext {
  const createdTasks: Resource[] = [];
  const createSpy = vi.fn((resource: Resource): Promise<Resource> => {
    const saved = { ...resource, id: `task-${createdTasks.length + 1}` };
    if (saved.resourceType === "Task") {
      createdTasks.push(saved);
    }
    return Promise.resolve(saved);
  });
  const client = {
    createResource: createSpy,
  } as never as MedplumClient;

  return { client, createdTasks, createSpy };
}

function createBotEvent(coverage: Coverage): BotEvent<Coverage> {
  return {
    bot: { reference: "Bot/eligibility-stub" },
    contentType: "application/json",
    input: coverage,
    secrets: {},
  };
}

describe("eligibility-stub bot", () => {
  describe("isInactiveCoverage", () => {
    it("returns true when coverage status is cancelled", () => {
      const coverage: Coverage = {
        resourceType: "Coverage",
        status: "cancelled",
        beneficiary: { reference: "Patient/pat-1" },
        payor: [{ reference: "Organization/payer-1" }],
      };
      expect(isInactiveCoverage(coverage)).toBe(true);
    });

    it("returns true when payor reference indicates inactive payer", () => {
      const coverage: Coverage = {
        resourceType: "Coverage",
        status: "active",
        beneficiary: { reference: "Patient/pat-1" },
        payor: [{ reference: "Organization/payer-inactive-99" }],
      };
      expect(isInactiveCoverage(coverage)).toBe(true);
    });

    it("returns true when payor display indicates inactive payer", () => {
      const coverage: Coverage = {
        resourceType: "Coverage",
        status: "active",
        beneficiary: { reference: "Patient/pat-1" },
        payor: [{ reference: "Organization/payer-1", display: "Simulated Inactive Payer" }],
      };
      expect(isInactiveCoverage(coverage)).toBe(true);
    });

    it("returns true when coverage class name indicates inactive plan", () => {
      const coverage: Coverage = {
        resourceType: "Coverage",
        status: "active",
        beneficiary: { reference: "Patient/pat-1" },
        payor: [{ reference: "Organization/payer-1" }],
        class: [{ type: { text: "plan" }, value: "PL1", name: "Inactive Plan" }],
      };
      expect(isInactiveCoverage(coverage)).toBe(true);
    });

    it("returns false for active coverage with standard payer", () => {
      const coverage: Coverage = {
        resourceType: "Coverage",
        status: "active",
        beneficiary: { reference: "Patient/pat-1" },
        payor: [{ reference: "Organization/bcbs-1", display: "Blue Cross Blue Shield" }],
      };
      expect(isInactiveCoverage(coverage)).toBe(false);
    });
  });

  describe("handler", () => {
    it("creates a verify-eligibility Task when coverage is cancelled", async () => {
      const { client, createdTasks, createSpy } = setupMockMedplum();
      const coverage: Coverage = {
        resourceType: "Coverage",
        id: "cov-1",
        meta: { accounts: [{ reference: "Organization/fac-metro" }] },
        status: "cancelled",
        beneficiary: { reference: "Patient/pat-123" },
        payor: [{ reference: "Organization/payer-1", display: "Aetna" }],
      };

      const result = await handler(client, createBotEvent(coverage));

      expect(createSpy.mock.calls.length).toBe(1);
      expect(createdTasks.length).toBe(1);
      expect(result).toBeDefined();
      expect(result?.resourceType).toBe("Task");
      expect(result?.code?.coding?.[0]?.code).toBe("verify-eligibility");
      expect(result?.description).toBe("Verify inactive coverage for patient");
      expect(result?.priority).toBe("routine");
      expect(result?.for?.reference).toBe("Patient/pat-123");
      expect(result?.meta?.accounts?.[0]?.reference).toBe("Organization/fac-metro");
      expect(result?.status).toBe("requested");
      expect(result?.intent).toBe("order");
    });

    it("creates a verify-eligibility Task when payer is simulated inactive", async () => {
      const { client, createdTasks, createSpy } = setupMockMedplum();
      const coverage: Coverage = {
        resourceType: "Coverage",
        id: "cov-2",
        status: "active",
        beneficiary: { reference: "Patient/pat-456" },
        payor: [{ reference: "Organization/payer-inactive-stub" }],
      };

      const result = await handler(client, createBotEvent(coverage));

      expect(createSpy.mock.calls.length).toBe(1);
      expect(createdTasks.length).toBe(1);
      expect(result?.code?.coding?.[0]?.code).toBe("verify-eligibility");
      expect(result?.for?.reference).toBe("Patient/pat-456");
      expect(result?.meta?.accounts?.[0]?.reference).toBe("Organization/fac-default");
    });

    it("does not create a Task when coverage is active with active payer", async () => {
      const { client, createdTasks, createSpy } = setupMockMedplum();
      const coverage: Coverage = {
        resourceType: "Coverage",
        id: "cov-3",
        status: "active",
        beneficiary: { reference: "Patient/pat-789" },
        payor: [{ reference: "Organization/cigna", display: "Cigna Health" }],
      };

      const result = await handler(client, createBotEvent(coverage));

      expect(createSpy.mock.calls.length).toBe(0);
      expect(createdTasks.length).toBe(0);
      expect(result).toBeNull();
    });

    it("returns null when event input is not a Coverage resource", async () => {
      const { client, createdTasks, createSpy } = setupMockMedplum();
      const nonCoverage = {
        resourceType: "Patient",
        id: "pat-1",
      } as never as Coverage;

      const result = await handler(client, createBotEvent(nonCoverage));

      expect(createSpy.mock.calls.length).toBe(0);
      expect(createdTasks.length).toBe(0);
      expect(result).toBeNull();
    });

    it("handles coverage without beneficiary reference", async () => {
      const { client, createdTasks, createSpy } = setupMockMedplum();
      const coverage: Coverage = {
        resourceType: "Coverage",
        status: "cancelled",
        beneficiary: { display: "Unlinked Patient" },
        payor: [{ reference: "Organization/payer-1" }],
      };

      const result = await handler(client, createBotEvent(coverage));

      expect(createSpy.mock.calls.length).toBe(1);
      expect(createdTasks.length).toBe(1);
      expect(result?.for).toBeUndefined();
    });
  });
});
