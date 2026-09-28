"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@asc/api-client";
import { useConvertReferral, useDuplicateCheck, usePatient } from "@asc/api-client/react";
import type { Referral } from "@asc/types";
import { Button, Skeleton, toast } from "@asc/ui";
import { CalendarPlus, CircleCheck, Link2, Loader2, ScanSearch, TriangleAlert, UserPlus } from "@asc/ui/icons";
import { registrationDefaultsFromReferral } from "./referral-prefill";

interface ReferralActionsProps {
  readonly referral: Referral;
}

/** Create patient (→ prefilled registration) · match an existing chart · book the case once linked. */
export function ReferralActions({ referral }: ReferralActionsProps) {
  const router = useRouter();
  const duplicates = useDuplicateCheck();
  const convert = useConvertReferral(referral.id);

  if (referral.status === "converted" && referral.patientId) {
    return <LinkedPatient referralId={referral.id} patientId={referral.patientId} />;
  }

  const identity = registrationDefaultsFromReferral(referral);
  const runMatch = () =>
    duplicates.mutate({ firstName: identity.firstName, lastName: identity.lastName, dateOfBirth: identity.dateOfBirth });

  const link = async (patientId: string) => {
    try {
      const result = await convert.mutateAsync({ patientId });
      toast.success(`Referral linked to ${result.patient.mrn}`, { description: "Book the case next." });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not link the referral.");
    }
  };

  const matches = duplicates.data?.matches ?? [];
  return (
    <div className="space-y-3" data-testid="referral-actions">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => router.push(`/patients/new?referral=${referral.id}`)} data-testid="referral-create-patient">
          <UserPlus aria-hidden /> Create patient
        </Button>
        <Button variant="outline" onClick={runMatch} disabled={duplicates.isPending} data-testid="referral-match-existing">
          {duplicates.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <ScanSearch aria-hidden />}
          Match existing
        </Button>
        <Button variant="outline" disabled title="Link or create the patient first" data-testid="referral-book-case">
          <CalendarPlus aria-hidden /> Book case
        </Button>
      </div>

      <div aria-live="polite">
        {duplicates.isError && <p className="text-sm text-destructive">Match search failed — try again.</p>}
        {duplicates.isSuccess && matches.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="referral-no-match">
            <CircleCheck aria-hidden className="size-4 text-success" /> No existing chart for {identity.firstName} {identity.lastName} ({identity.dateOfBirth}) — create a new patient.
          </p>
        )}
        {matches.length > 0 && (
          <ul className="space-y-2" data-testid="referral-matches">
            {matches.map((match) => (
              <li key={match.patient.id} className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <TriangleAlert aria-hidden className="size-3.5 text-warning" /> {match.patient.displayName}
                    <span className="font-normal text-muted-foreground tabular-nums">· {Math.round(match.score * 100)}% match</span>
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    <span className="font-mono">{match.patient.mrn}</span> · DOB {match.patient.dateOfBirth} · {match.reasons.join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" render={<Link href={`/patients/${match.patient.id}`} />} nativeButton={false}>
                    Open chart
                  </Button>
                  <Button size="sm" onClick={() => void link(match.patient.id)} disabled={convert.isPending} data-testid="referral-link-patient">
                    {convert.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Link2 aria-hidden />}
                    Link to this chart
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface LinkedPatientProps {
  readonly referralId: string;
  readonly patientId: string;
}

function LinkedPatient({ referralId, patientId }: LinkedPatientProps) {
  const patient = usePatient(patientId);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-success/30 bg-success/5 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="referral-linked">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />
        {patient.isPending ? (
          <Skeleton className="h-4 w-48" />
        ) : (
          <span className="min-w-0 truncate">
            Linked to{" "}
            <span className="font-semibold">
              {patient.data ? `${patient.data.firstName} ${patient.data.lastName}` : "patient"}
            </span>{" "}
            <span className="font-mono text-xs text-muted-foreground">{patient.data?.mrn}</span>
          </span>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" render={<Link href={`/patients/${patientId}`} />} nativeButton={false}>
          Open chart
        </Button>
        <Button size="sm" render={<Link href={`/schedule?book=1&patient=${patientId}&referral=${referralId}`} />} nativeButton={false} data-testid="referral-book-case">
          <CalendarPlus aria-hidden /> Book case
        </Button>
      </div>
    </div>
  );
}
