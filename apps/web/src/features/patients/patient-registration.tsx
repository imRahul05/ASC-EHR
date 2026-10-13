"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OfflineBanner, PageHeader } from "@asc/ui";
import { ArrowLeft } from "@asc/ui/icons";
import { RegistrationForm } from "./registration-form";

function RegistrationView() {
  const router = useRouter();

  const header = (
    <PageHeader
      eyebrow={
        <Link href="/patients" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft aria-hidden className="size-3" /> Patients
        </Link>
      }
      title="Register patient"
      description="Demographics, contact address, coverage and escort. Duplicate charts are checked before anything is created."
    />
  );

  return (
    <div className="space-y-5" data-testid="patient-registration">
      {header}
      <OfflineBanner />
      <RegistrationForm
        onSuccess={(result) => {
          router.push(`/patients/${result.patient.id}`);
        }}
      />
    </div>
  );
}

export function PatientRegistration() {
  return (
    <Suspense>
      <RegistrationView />
    </Suspense>
  );
}
