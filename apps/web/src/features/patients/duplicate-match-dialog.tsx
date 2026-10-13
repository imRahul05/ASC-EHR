"use client";

import Link from "next/link";
import { usePatient } from "@asc/api-client/react";
import type { DuplicateMatchResult } from "@asc/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@asc/ui";
import { ExternalLink, Loader2, ShieldAlert, TriangleAlert } from "@asc/ui/icons";

interface SubmittedPatientData {
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: string;
  readonly gender: string;
  readonly phone: string;
  readonly mrn?: string;
  readonly address?: {
    readonly line?: readonly string[];
    readonly city?: string;
    readonly state?: string;
    readonly postalCode?: string;
    readonly country?: string;
  };
}

interface DuplicateMatchDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly conflictCode: "duplicate_mrn_conflict" | "duplicate_patient_detected" | null;
  readonly duplicateMatch?: DuplicateMatchResult | null;
  readonly submittedData: SubmittedPatientData;
  readonly onConfirmAnyway?: () => void;
  readonly isSubmitting?: boolean;
}

function formatAddress(addr?: SubmittedPatientData["address"]): string {
  if (!addr) return "None provided";
  const parts = [
    addr.line?.[0],
    addr.city,
    addr.state,
    addr.postalCode,
    addr.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "None provided";
}

/**
 * Modal dialog for handling 409 Conflict during patient registration:
 * 1. Exact MRN Conflict (non-waivable): red banner, "Register anyway" is disabled.
 * 2. Demographic Overlap: amber banner, side-by-side comparison, "Confirm and Register Anyway" (confirmDuplicate: true) or "View Existing Chart".
 */
export function DuplicateMatchDialog({
  open,
  onOpenChange,
  conflictCode,
  duplicateMatch,
  submittedData,
  onConfirmAnyway,
  isSubmitting = false,
}: DuplicateMatchDialogProps) {
  const isMrnConflict = conflictCode === "duplicate_mrn_conflict";
  const candidateMatch = duplicateMatch?.matches?.[0];
  const candidatePatientId = candidateMatch?.patientId;

  const candidateQuery = usePatient(candidatePatientId ?? "", {
    enabled: Boolean(candidatePatientId),
  });
  const candidate = candidateQuery.data;

  const candidateAddress = candidate?.address
    ? [candidate.address.line, candidate.address.city, candidate.address.state, candidate.address.postalCode]
        .filter(Boolean)
        .join(", ")
    : "None on file";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-2xl" data-testid="duplicate-match-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            {isMrnConflict ? (
              <>
                <ShieldAlert aria-hidden className="size-5 text-destructive" />
                Exact MRN Conflict
              </>
            ) : (
              <>
                <TriangleAlert aria-hidden className="size-5 text-warning" />
                Potential Duplicate Patient Detected
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isMrnConflict
              ? "A record with this Medical Record Number already exists in this facility."
              : "An existing chart matches the demographic information entered. Review before proceeding."}
          </DialogDescription>
        </DialogHeader>

        {isMrnConflict ? (
          <div
            role="alert"
            className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            data-testid="duplicate-mrn-alert"
          >
            <p className="font-medium">
              Another patient already has MRN{" "}
              <span className="font-mono font-bold">{submittedData.mrn}</span> at this facility.
            </p>
            <p className="text-xs text-muted-foreground">
              Duplicate MRNs within the same facility are strictly prohibited by facility policy.
              The override waiver is not permitted for exact MRN collisions.
            </p>
            {candidatePatientId && (
              <div className="pt-1">
                <Button
                  render={<Link href={`/patients/${candidatePatientId}`} />}
                  nativeButton={false}
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  data-testid="duplicate-view-existing-chart"
                >
                  <ExternalLink aria-hidden className="size-3.5" />
                  View Existing Chart ({submittedData.mrn})
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div
              role="alert"
              className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground"
              data-testid="duplicate-demographic-alert"
            >
              <p className="font-semibold text-warning">Demographic Overlap Warning</p>
              <p className="text-muted-foreground">
                First name, last name, and date of birth match an existing patient chart. Compare
                the details below to verify if this is the same individual.
              </p>
            </div>

            {/* Side-by-side comparison */}
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 text-xs">
              <div className="space-y-2 border-r border-border pr-3">
                <p className="font-semibold uppercase tracking-wide text-muted-foreground">
                  Submitted Intake Data
                </p>
                <div className="space-y-1">
                  <div>
                    <span className="text-muted-foreground">Name: </span>
                    <span className="font-medium">
                      {submittedData.firstName} {submittedData.lastName}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">DOB: </span>
                    <span className="font-medium tabular-nums">{submittedData.dateOfBirth}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Gender: </span>
                    <span className="font-medium capitalize">{submittedData.gender}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phone: </span>
                    <span className="font-medium tabular-nums">{submittedData.phone}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Address: </span>
                    <span className="font-medium">{formatAddress(submittedData.address)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pl-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold uppercase tracking-wide text-muted-foreground">
                    Existing Patient Chart
                  </p>
                  {candidatePatientId && (
                    <Link
                      href={`/patients/${candidatePatientId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      data-testid="duplicate-candidate-link"
                    >
                      Open <ExternalLink aria-hidden className="size-3" />
                    </Link>
                  )}
                </div>

                {candidateQuery.isPending ? (
                  <div className="space-y-1.5 pt-1">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                ) : candidate ? (
                  <div className="space-y-1">
                    <div>
                      <span className="text-muted-foreground">Name: </span>
                      <span className="font-medium">
                        {candidate.firstName} {candidate.lastName}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">DOB: </span>
                      <span className="font-medium tabular-nums">{candidate.dateOfBirth}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Gender: </span>
                      <span className="font-medium capitalize">
                        {candidate.sex === "F" ? "Female" : candidate.sex === "M" ? "Male" : "Other"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone: </span>
                      <span className="font-medium tabular-nums">{candidate.phone}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Address: </span>
                      <span className="font-medium">{candidateAddress}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Candidate details unavailable.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="duplicate-dialog-cancel"
          >
            {isMrnConflict ? "Edit MRN" : "Review Form"}
          </Button>

          {isMrnConflict ? (
            <Button
              type="button"
              disabled
              title="Non-waivable: MRN duplicates cannot be overridden."
              data-testid="duplicate-register-anyway-disabled"
            >
              Register anyway (Locked)
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              onClick={onConfirmAnyway}
              disabled={isSubmitting}
              data-testid="duplicate-confirm-register-anyway"
            >
              {isSubmitting ? (
                <>
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  Registering…
                </>
              ) : (
                "Confirm and Register Anyway"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
