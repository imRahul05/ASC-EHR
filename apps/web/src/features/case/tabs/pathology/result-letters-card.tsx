"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useSendResultLetter } from "@asc/api-client/react";
import { formatDate, formatDateTime } from "@asc/clinical-rules/time";
import type { CaseDetail, CasePathology, ResultLetter } from "@asc/types";
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SectionCard,
  toast,
} from "@asc/ui";
import { CircleCheck, Eye, LoaderCircle, Send } from "@asc/ui/icons";
import { HISTOLOGY_LABEL } from "./pathology-labels";

type Recipient = ResultLetter["recipient"];

const RECIPIENTS: readonly { readonly recipient: Recipient; readonly channel: ResultLetter["channel"]; readonly label: string; readonly via: string }[] = [
  { recipient: "patient", channel: "portal", label: "Patient", via: "Patient portal" },
  { recipient: "referring_provider", channel: "fax", label: "Referring provider", via: "Fax" },
];

/** Letter body shown in the preview (the API stores the summary line and sends the letter). */
function letterPreview(recipient: Recipient, detail: CaseDetail, pathology: CasePathology): readonly string[] {
  const findings = pathology.results.map((result) => `• ${HISTOLOGY_LABEL[result.histology]}${result.isAdenoma ? " (precancerous)" : ""}`);
  const plan = pathology.surveillance ?? pathology.recommendation;
  const next = plan ? `Next colonoscopy in ${plan.intervalYears} years${pathology.surveillance ? ` (due ${formatDate(pathology.surveillance.dueDate)})` : ""}.` : "";
  const greeting = recipient === "patient" ? `Dear ${detail.patient.firstName},` : `Dear ${detail.patient.referringProvider ?? "colleague"},`;
  const opening =
    recipient === "patient"
      ? `Your ${detail.case.procedureLabel.toLowerCase()} on ${formatDate(detail.case.scheduledStart)} went well. The lab has looked at the tissue we removed:`
      : `Re: ${detail.case.patient.displayName} (DOB ${formatDate(detail.patient.dateOfBirth)}), ${detail.case.procedureLabel} on ${formatDate(detail.case.scheduledStart)}. Pathology:`;
  return [greeting, opening, ...findings, next, `— ${detail.case.team.surgeon.name}`].filter(Boolean);
}

interface ResultLettersCardProps {
  readonly detail: CaseDetail;
  readonly pathology: CasePathology;
  readonly editable: boolean;
}

/** Result letters to patient (portal) and referrer (fax): preview → send. Never auto-sent. */
export function ResultLettersCard({ detail, pathology, editable }: ResultLettersCardProps) {
  const [previewing, setPreviewing] = useState<(typeof RECIPIENTS)[number] | null>(null);
  const send = useSendResultLetter(detail.case.id);
  const ready = pathology.results.length > 0 && pathology.specimens.every((specimen) => specimen.pathologyStatus !== "pending");

  const onSend = () =>
    previewing &&
    send.mutate(
      { recipient: previewing.recipient, channel: previewing.channel },
      {
        onSuccess: () => {
          toast.success(`Letter sent to ${previewing.label.toLowerCase()}`);
          setPreviewing(null);
        },
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not send the letter"),
      },
    );

  return (
    <SectionCard title="Result letters" description={ready ? "Preview, then send." : "Available when every specimen has a result."} data-testid="pathology-letters">
      <ul className="space-y-2">
        {RECIPIENTS.map((item) => {
          const sent = pathology.letters.filter((letter) => letter.recipient === item.recipient).at(-1);
          return (
            <li key={item.recipient} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="truncate text-xs text-muted-foreground">{sent ? `Sent ${formatDateTime(sent.sentAt)} · ${sent.summary}` : item.via}</p>
              </div>
              {sent ? (
                <Badge variant="outline" className="border-success/30 text-success">
                  <CircleCheck /> Sent
                </Badge>
              ) : (
                <Button size="sm" variant="outline" disabled={!ready || !editable} onClick={() => setPreviewing(item)} data-testid={`pathology-letter-${item.recipient}`}>
                  <Eye /> Preview
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={previewing !== null} onOpenChange={(open) => (open ? undefined : setPreviewing(null))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Letter to {previewing?.label.toLowerCase()}</DialogTitle>
            <DialogDescription>
              {detail.case.patient.displayName} · {detail.case.caseNumber} · via {previewing?.via.toLowerCase()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm" data-testid="pathology-letter-preview">
            {previewing && letterPreview(previewing.recipient, detail, pathology).map((line) => <p key={line}>{line}</p>)}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={onSend} disabled={send.isPending} data-testid="pathology-letter-send">
              {send.isPending ? <LoaderCircle className="animate-spin" /> : <Send />}
              Send letter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
