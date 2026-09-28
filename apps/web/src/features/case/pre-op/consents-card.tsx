"use client";

import { useState } from "react";
import { formatTime24 } from "@asc/clinical-rules/time";
import type { CaseDetail } from "@asc/types";
import { Button, cn, EmptyState, SectionCard } from "@asc/ui";
import { CircleCheck, CircleDashed, CircleX, FileSignature, FileText } from "@asc/ui/icons";
import { useAuthStore } from "@/lib/stores/auth.store";
import { ConsentSignDialog } from "./consent-sign-dialog";

interface ConsentsCardProps {
  readonly detail: CaseDetail;
}

const STATUS_META = {
  pending: { label: "Awaiting signature", icon: CircleDashed, tone: "text-warning" },
  signed: { label: "Signed", icon: CircleCheck, tone: "text-success" },
  declined: { label: "Declined", icon: CircleX, tone: "text-destructive" },
} as const;

/** Procedure + anesthesia consents; pending ones open the signature dialog. */
export function ConsentsCard({ detail }: ConsentsCardProps) {
  const [signingId, setSigningId] = useState<string | null>(null);
  const witnessName = useAuthStore((state) => state.session?.user.fullName ?? "Current user");
  const signing = detail.consents.find((consent) => consent.id === signingId) ?? null;
  const pending = detail.consents.filter((consent) => consent.status !== "signed").length;

  return (
    <SectionCard
      title="Consents"
      description={pending > 0 ? `${pending} awaiting signature` : detail.consents.length > 0 ? "All consents signed" : undefined}
      data-testid="preop-consents"
    >
      {detail.consents.length === 0 ? (
        <EmptyState icon={FileText} title="No consents on file" description="Consents are generated when the case is confirmed." />
      ) : (
        <ul className="divide-y divide-border">
          {detail.consents.map((consent) => {
            const status = STATUS_META[consent.status];
            const StatusIcon = status.icon;
            return (
              <li key={consent.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" data-testid={`preop-consent-${consent.kind}`} data-status={consent.status}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{consent.title}</p>
                  <p className="text-xs text-muted-foreground">{consent.summary}</p>
                  <p className={cn("mt-1 flex items-center gap-1 text-xs font-medium", status.tone)}>
                    <StatusIcon aria-hidden className="size-3.5" />
                    {status.label}
                    {consent.status === "signed" && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {consent.signerName}
                        {consent.signedAt ? ` at ${formatTime24(consent.signedAt)}` : ""}
                        {consent.witness ? ` · witness ${consent.witness.name}` : ""}
                      </span>
                    )}
                  </p>
                </div>
                {consent.status === "pending" && (
                  <Button className="min-h-11" onClick={() => setSigningId(consent.id)} data-testid={`preop-consent-${consent.kind}-sign`}>
                    <FileSignature aria-hidden /> Sign
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConsentSignDialog
        key={signingId ?? "none"}
        caseId={detail.case.id}
        consent={signing}
        patientName={detail.case.patient.displayName}
        witnessName={witnessName}
        onClose={() => setSigningId(null)}
      />
    </SectionCard>
  );
}
