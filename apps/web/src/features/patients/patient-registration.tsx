"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useReferral } from "@asc/api-client/react";
import type { Patient, Referral } from "@asc/types";
import { AiBadge, Button, ErrorState, LoadingSkeleton, OfflineBanner, PageHeader, PatientBanner, SectionCard } from "@asc/ui";
import { ArrowLeft, CalendarPlus, CircleCheck, FileText } from "@asc/ui/icons";
import { EMPTY_PATIENT_REGISTRATION } from "@asc/validation/patient";
import { registrationDefaultsFromReferral } from "../referrals/referral-prefill";
import { CoverageCard } from "./coverage-card";
import { patientRefOf } from "./patient-ref";
import { RegistrationForm } from "./registration-form";

interface Created {
  readonly patient: Patient;
  readonly how: "created" | "linked";
}

/** `/patients/new` (optionally `?referral=<id>` — prefilled from the fax's AI-extracted facts). */
function RegistrationView() {
  const referralId = useSearchParams().get("referral");
  const referral = useReferral(referralId);
  const [created, setCreated] = useState<Created | null>(null);

  const header = (
    <PageHeader
      eyebrow={
        <Link href={referralId ? "/referrals" : "/patients"} className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft aria-hidden className="size-3" /> {referralId ? "Referrals" : "Patients"}
        </Link>
      }
      title={created ? "Patient registered" : "Register patient"}
      description={
        created
          ? "Verify eligibility, then book the procedure."
          : "Demographics, coverage and escort. Duplicate charts are checked before anything is created."
      }
    />
  );

  if (referralId && referral.isPending) return <LoadingSkeleton variant="detail" />;
  if (referralId && referral.isError) {
    return (
      <div className="space-y-5">
        {header}
        <ErrorState title="Could not load the referral" message="Open it again from the referral inbox." onRetry={() => void referral.refetch()} />
      </div>
    );
  }

  const source: Referral | null = referral.data ?? null;

  if (created) {
    const bookHref = `/schedule?book=1&patient=${created.patient.id}${source ? `&referral=${source.id}` : ""}`;
    return (
      <div className="space-y-5" data-testid="registration-complete">
        {header}
        <PatientBanner patient={patientRefOf(created.patient)} allergies={created.patient.allergies} escort={created.patient.escort} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <CoverageCard patient={created.patient} />
          <SectionCard title="Next steps" className="self-start">
            <div className="space-y-3">
              <p className="flex items-start gap-2 text-sm text-success">
                <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
                {created.how === "linked" ? "Referral linked to the existing chart." : `Chart ${created.patient.mrn} created.`}
              </p>
              <Button render={<Link href={bookHref} />} nativeButton={false} className="w-full" data-testid="registration-book-case">
                <CalendarPlus aria-hidden /> Book case
              </Button>
              <Button render={<Link href={`/patients/${created.patient.id}`} />} nativeButton={false} variant="outline" className="w-full" data-testid="registration-open-chart">
                Open chart
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="patient-registration">
      {header}
      <OfflineBanner />
      {source && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ai-border bg-ai/60 px-3 py-2 text-sm text-ai-foreground" data-testid="registration-referral-source">
          <FileText aria-hidden className="size-4" />
          <span>
            Prefilled from the fax from <span className="font-medium">{source.fromPractice}</span>
          </span>
          <AiBadge label="AI-extracted · review each field" />
        </div>
      )}
      <RegistrationForm
        defaults={source ? registrationDefaultsFromReferral(source) : EMPTY_PATIENT_REGISTRATION}
        referral={source}
        onCreated={(patient, how) => setCreated({ patient, how })}
      />
    </div>
  );
}

export function PatientRegistration() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="detail" />}>
      <RegistrationView />
    </Suspense>
  );
}
