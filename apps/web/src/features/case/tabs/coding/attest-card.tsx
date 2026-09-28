"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useAttestCoding } from "@asc/api-client/react";
import { fromChecks } from "@asc/clinical-rules";
import { formatDateTime } from "@asc/clinical-rules/time";
import type { CaseCoding, CaseSummaryFlags } from "@asc/types";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  GateChecklist,
  SectionCard,
  toast,
} from "@asc/ui";
import { LoaderCircle, ShieldCheck } from "@asc/ui/icons";

interface AttestCardProps {
  readonly coding: CaseCoding;
  readonly noteStatus: CaseSummaryFlags["noteStatus"];
  readonly patientName: string;
  readonly caseNumber: string;
}

/** Coder attestation: same checks the API runs (note signed, codes present, all reviewed), then an explicit confirm. */
export function AttestCard({ coding, noteStatus, patientName, caseNumber }: AttestCardProps) {
  const [confirming, setConfirming] = useState(false);
  const attest = useAttestCoding(coding.caseId);
  const unreviewed = coding.suggestions.filter((item) => item.status === "suggested").length;
  const kept = coding.suggestions.filter((item) => item.status !== "rejected").length;
  const done = coding.status === "attested" || coding.status === "exported";
  const gate = fromChecks([
    { code: "NOTE_SIGNED", label: "Procedure note signed", ok: noteStatus === "signed", message: "Sign the procedure note first (Note tab)." },
    { code: "CODES_PRESENT", label: "Codes present", ok: coding.suggestions.length > 0, message: "No codes to attest." },
    { code: "ALL_REVIEWED", label: "Every suggestion reviewed", ok: unreviewed === 0, message: `${unreviewed} suggestion(s) still need accept / reject / edit.` },
  ]);

  const onAttest = () =>
    attest.mutate(undefined, {
      onSuccess: () => toast.success(`Coding attested for ${caseNumber}`),
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not attest coding"),
      onSettled: () => setConfirming(false),
    });

  return (
    <SectionCard
      title="Coder attestation"
      description={done && coding.attestedAt ? `Attested by ${coding.attestedBy?.name ?? "coder"} · ${formatDateTime(coding.attestedAt)}` : "AI suggests; a certified coder decides."}
      data-testid="coding-attest"
    >
      {done ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <ShieldCheck className="size-4" aria-hidden /> {kept} code(s) attested — locked for changes.
        </p>
      ) : (
        <div className="space-y-4">
          <GateChecklist result={gate} />
          <Button className="w-full" disabled={!gate.ok || attest.isPending} onClick={() => setConfirming(true)} data-testid="coding-attest-button">
            <ShieldCheck /> Attest codes
          </Button>
        </div>
      )}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attest coding for {patientName}?</DialogTitle>
            <DialogDescription>
              {patientName} · {caseNumber}: you attest {kept} code(s) as supported by the signed documentation. Codes lock after attestation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Review again</DialogClose>
            <Button onClick={onAttest} disabled={attest.isPending} data-testid="coding-attest-confirm">
              {attest.isPending ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
              Attest {kept} code(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
