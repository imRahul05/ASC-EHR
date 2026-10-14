"use client";

import { useAuthStore } from "@/lib/stores/auth.store";

interface ActiveFacilityResult {
  readonly facilityId: string | null;
  readonly facility: { readonly id: string; readonly name: string } | null;
  readonly hasFacility: boolean;
}

export function useActiveFacility(): ActiveFacilityResult {
  const facilityId = useAuthStore((s) => s.facilityId);
  const facilities = useAuthStore((s) => s.facilities);
  const facility = facilities.find((f) => f.id === facilityId) ?? null;
  return {
    facilityId,
    facility,
    hasFacility: facilityId !== null,
  };
}
