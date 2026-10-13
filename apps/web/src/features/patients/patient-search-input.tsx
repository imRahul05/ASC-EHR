"use client";

import { useDeferredValue, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchPatients } from "@asc/api-client/react";
import type { PatientListItem } from "@asc/types";
import { PatientSearchInput as PresentationalSearchInput } from "@asc/ui";
import { useAuthStore } from "../../lib/stores/auth.store";

interface ConnectedPatientSearchInputProps {
  readonly onSelectPatient?: (patient: PatientListItem) => void;
  readonly placeholder?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
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

  const searchQuery = useSearchPatients(
    {
      name: deferredTerm,
      facilityId: facilityId ?? undefined,
    },
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
