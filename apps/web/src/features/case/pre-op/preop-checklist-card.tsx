"use client";

import { useState, type ReactNode } from "react";
import { ApiError } from "@asc/api-client";
import { useSavePreOp } from "@asc/api-client/react";
import { formatDuration, formatTime24, minutesBetween } from "@asc/clinical-rules/time";
import type { CaseDetail, SavePreOpPayload } from "@asc/types";
import { Button, cn, OptionSelect, SectionCard, toast } from "@asc/ui";
import { CircleCheck, CircleDashed, Droplet, UtensilsCrossed, UserCheck, type LucideIcon } from "@asc/ui/icons";

interface PreOpChecklistCardProps {
  readonly detail: CaseDetail;
}

const IV_SITES = [
  { value: "left_hand", label: "Left hand" },
  { value: "right_hand", label: "Right hand" },
  { value: "left_forearm", label: "Left forearm" },
  { value: "right_forearm", label: "Right forearm" },
  { value: "left_ac", label: "Left antecubital" },
  { value: "right_ac", label: "Right antecubital" },
] as const;

type IvSite = (typeof IV_SITES)[number]["value"];

function Row({
  icon: Icon,
  title,
  detail,
  done,
  children,
  testId,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly detail: ReactNode;
  readonly done: boolean;
  readonly children?: ReactNode;
  readonly testId: string;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" data-testid={testId} data-done={done}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", done ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {title}
            <span className={cn("inline-flex items-center gap-1 text-xs font-normal", done ? "text-success" : "text-warning")}>
              {done ? <CircleCheck aria-hidden className="size-3.5" /> : <CircleDashed aria-hidden className="size-3.5" />}
              {done ? "Done" : "Pending"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </li>
  );
}

/** NPO, IV access and escort — each is one PATCH /pre-op command; the readiness gate updates live. */
export function PreOpChecklistCard({ detail }: PreOpChecklistCardProps) {
  const [ivSite, setIvSite] = useState<IvSite | "">("");
  const save = useSavePreOp(detail.case.id);
  const { readiness, npoSince } = detail.case;
  const escort = detail.patient.escort;

  const update = (payload: SavePreOpPayload, message: string) =>
    save.mutate(payload, {
      onSuccess: () => toast.success(message),
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update pre-op"),
    });

  const ivLabel = IV_SITES.find((site) => site.value === ivSite)?.label;

  return (
    <SectionCard title="Pre-op checklist" description="NPO, IV access and escort." data-testid="preop-checklist">
      <ul className="divide-y divide-border">
        <Row
          icon={UtensilsCrossed}
          title="NPO"
          done={readiness.npoConfirmed}
          testId="preop-npo"
          detail={npoSince ? `NPO since ${formatTime24(npoSince)} · ${formatDuration(minutesBetween(npoSince))}` : "Last oral intake not recorded"}
        >
          {!readiness.npoConfirmed && (
            <Button className="min-h-11" disabled={save.isPending} onClick={() => update({ npoConfirmed: true }, "NPO confirmed")} data-testid="preop-npo-confirm">
              Confirm NPO
            </Button>
          )}
        </Row>

        <Row
          icon={Droplet}
          title="IV access"
          done={readiness.ivPlaced}
          testId="preop-iv"
          detail={readiness.ivPlaced ? `Peripheral IV in place${ivLabel ? ` · ${ivLabel}` : ""}` : "Select the site, then record placement."}
        >
          {!readiness.ivPlaced && (
            <>
              <OptionSelect
                id="preop-iv-site"
                options={IV_SITES}
                value={ivSite}
                onValueChange={setIvSite}
                placeholder="IV site"
                className="h-11 w-44"
                data-testid="preop-iv-site"
              />
              <Button
                className="min-h-11"
                disabled={!ivSite || save.isPending}
                onClick={() => update({ ivPlaced: true }, `IV placed · ${ivLabel ?? ""}`)}
                data-testid="preop-iv-confirm"
              >
                Record IV placed
              </Button>
            </>
          )}
        </Row>

        <Row
          icon={UserCheck}
          title="Escort"
          done={readiness.escortConfirmed}
          testId="preop-escort"
          detail={
            escort
              ? `${escort.name} (${escort.relationship}) · ${escort.phone} · ${escort.present ? "present" : "not yet present"}`
              : "No escort on file — the case cannot be discharged without one."
          }
        >
          {escort && !readiness.escortConfirmed && (
            <Button
              className="min-h-11"
              disabled={save.isPending}
              onClick={() => update({ escortConfirmed: true }, "Escort confirmed")}
              data-testid="preop-escort-confirm"
            >
              Confirm escort
            </Button>
          )}
          {escort && readiness.escortConfirmed && !escort.present && (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={save.isPending}
              onClick={() => update({ escortPresent: true }, "Escort marked present")}
              data-testid="preop-escort-present"
            >
              Mark present
            </Button>
          )}
        </Row>
      </ul>
    </SectionCard>
  );
}
