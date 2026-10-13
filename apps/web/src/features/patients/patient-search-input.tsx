"use client";

import { useDeferredValue, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchPatients } from "@asc/api-client/react";
import type { PatientListItem } from "@asc/types";
import type { PatientSearchBodyInput } from "@asc/validation/patients/search";
import { PatientSearchInput as PresentationalSearchInput } from "@asc/ui";
import { useAuthStore } from "../../lib/stores/auth.store";

interface ConnectedPatientSearchInputProps {
  readonly onSelectPatient?: (patient: PatientListItem) => void;
  readonly placeholder?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}

/**
 * Disambiguates a raw search term into DOB (YYYY-MM-DD), MRN, or patient name.
 */
export function buildSearchPayload(
  term: string,
  facilityId: string | null | undefined,
): PatientSearchBodyInput {
  const trimmed = term.trim();
  const isDob = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const isMrn =
    /^(MRN-)?[A-Z0-9.-]+$/i.test(trimmed) &&
    !/\s/.test(trimmed) &&
    /[0-9]/.test(trimmed);

  if (isDob) {
    return { dob: trimmed, facilityId: facilityId ?? undefined };
  }
  if (isMrn) {
    return { mrn: trimmed, facilityId: facilityId ?? undefined };
  }
  return { name: trimmed, facilityId: facilityId ?? undefined };
}

/**
 * Connected patient search typeahead: debounces input with useDeferredValue, calls POST /patients/search
 * (no PHI in query string), scopes to the active facility, and navigates or triggers onSelectPatient.
 */
export function PatientSearchInput({
  onSelectPatient,
  placeholder = "Search patients by name, MRN, or DOB…",
  className,
  "data-testid": testId = "patients-search-typeahead",
}: ConnectedPatientSearchInputProps) {
  const router = useRouter();
  const facilityId = useAuthStore((s) => s.facilityId);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredTerm = useDeferredValue(searchTerm.trim());

  const queryPayload = buildSearchPayload(deferredTerm, facilityId);
  const searchQuery = useSearchPatients(
    queryPayload,
    {
      enabled: deferredTerm.length > 0,
    },
  );

  const results = deferredTerm.length > 0 ? (searchQuery.data ?? []) : [];
  const isLoading = searchQuery.isFetching;

  const handleSelect = (patient: PatientListItem) => {
    if (onSelectPatient) {
      onSelectPatient(patient);
    } else {
      router.push(`/patients/${patient.id}`);
    }
  };

  return (
    <PresentationalSearchInput
      value={searchTerm}
      onChange={setSearchTerm}
      results={results}
      isLoading={isLoading}
      onSelect={handleSelect}
      placeholder={placeholder}
      className={className}
      data-testid={testId}
    />
  );
}
