import type { MedplumClient } from "@medplum/core";
import type { Encounter } from "@medplum/fhirtypes";

/**
 * Finds an Encounter by caseId and verifies that it is scoped to the specified facilityId.
 *
 * Multi-Tenancy & Authorization Guard:
 * ASC encounters are scoped by `meta.accounts` or `serviceProvider` matching `Organization/${facilityId}`.
 * If the encounter does not exist or belongs to another facility, returns `null` to prevent cross-tenant data leakage.
 *
 * @param medplum - Medplum FHIR client
 * @param facilityId - Active facility identifier
 * @param caseId - Target case (Encounter) ID
 * @returns The verified Encounter, or null if not found or unauthorized
 */
export async function findAuthorizedEncounter(
  medplum: MedplumClient,
  facilityId: string,
  caseId: string
): Promise<Encounter | null> {
  const facilityAccountRef = `Organization/${facilityId}`;

  let encounter: Encounter | null;
  try {
    encounter = await medplum.readResource("Encounter", caseId);
  } catch {
    const found = await medplum.searchResources("Encounter", [
      ["_id", caseId],
      ["_count", "1"],
    ]).catch(() => []);
    encounter = found[0] ?? null;
  }

  if (!encounter) {
    return null;
  }

  const isAuthorized =
    encounter.meta?.accounts?.some((a) => a.reference === facilityAccountRef) ||
    encounter.serviceProvider?.reference === facilityAccountRef;

  if (!isAuthorized) {
    return null;
  }

  return encounter;
}
