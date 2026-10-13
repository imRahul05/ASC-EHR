import { forFacility } from "@asc/api-client/server";
import type { BotEvent, MedplumClient } from "@medplum/core";
import type { Coverage, Task } from "@medplum/fhirtypes";
import { buildTask } from "@asc/fhir";

/**
 * Determines whether a coverage resource represents cancelled or simulated inactive coverage.
 */
export function isInactiveCoverage(coverage: Coverage): boolean {
  if (coverage.status === "cancelled") {
    return true;
  }
  const hasInactivePayor = coverage.payor?.some((p) => {
    const ref = p.reference?.toLowerCase() ?? "";
    const display = p.display?.toLowerCase() ?? "";
    return ref.includes("inactive") || display.includes("inactive");
  });
  if (hasInactivePayor) {
    return true;
  }
  const hasInactiveClass = coverage.class?.some((c) => {
    const name = c.name?.toLowerCase() ?? "";
    const val = c.value?.toLowerCase() ?? "";
    return name.includes("inactive") || val.includes("inactive");
  });
  return Boolean(hasInactiveClass);
}

/**
 * Medplum Bot triggered on Coverage creation.
 * If coverage.status === "cancelled" or simulated inactive payer,
 * creates a FHIR Task for the billing worklist (code: "verify-eligibility", priority: "routine").
 */
export async function handler(
  medplum: MedplumClient,
  event: BotEvent<Coverage>,
): Promise<Task | null> {
  const coverage = event.input;
  if (!coverage || coverage.resourceType !== "Coverage") {
    return null;
  }

  if (!isInactiveCoverage(coverage)) {
    return null;
  }

  const facilityRef = coverage.meta?.accounts?.[0]?.reference;
  const facilityId =
    facilityRef !== undefined && facilityRef.startsWith("Organization/")
      ? facilityRef.slice("Organization/".length)
      : "fac-default";

  const patientRef = coverage.beneficiary?.reference;
  const patientId =
    patientRef !== undefined && patientRef.startsWith("Patient/")
      ? patientRef.slice("Patient/".length)
      : undefined;

  const taskResource = buildTask({
    facilityId,
    type: "verify-eligibility",
    patientId,
    description: "Verify inactive coverage for patient",
    priority: "routine",
    authoredOn: new Date().toISOString(),
  });

  const writer = forFacility(medplum, facilityId);
  return writer.create(taskResource);
}
