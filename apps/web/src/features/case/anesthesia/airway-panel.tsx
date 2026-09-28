"use client";

import { useAddAnesthesiaEntry } from "@asc/api-client/react";
import { AIRWAY_DEVICE_LABEL, AIRWAY_EVENT_LABEL, formatTime24 } from "@asc/clinical-rules";
import type { AirwayDevice, AirwayEventType, AnesthesiaRecord } from "@asc/types";
import { Button, SectionCard, SegmentedControl, toast } from "@asc/ui";
import { Minus, Plus, Wind } from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface AirwayPanelProps {
  readonly record: AnesthesiaRecord;
  readonly editable: boolean;
}

const DEVICES: readonly AirwayDevice[] = ["nasal_cannula", "face_mask", "high_flow_nasal", "lma"];
const DEVICE_OPTIONS = DEVICES.map((value) => ({ value, label: AIRWAY_DEVICE_LABEL[value] }));
const EVENTS = Object.keys(AIRWAY_EVENT_LABEL) as AirwayEventType[];
const O2_STEP = 1;
const O2_MAX = 15;

/** Airway device, O₂ flow (L/min) and airway events (jaw thrust, desaturation…). */
export function AirwayPanel({ record, editable }: AirwayPanelProps) {
  const add = useAddAnesthesiaEntry(record.caseId);
  const { device, o2Lpm } = record.airway;

  const setup = (patch: { readonly device?: AirwayDevice; readonly o2Lpm?: number }) =>
    add.mutate({ kind: "setup", ...patch }, { onError: notifyError("Could not update the airway") });
  const logEvent = (type: AirwayEventType) =>
    add.mutate(
      { kind: "airway_event", type },
      { onSuccess: () => toast.success(`${AIRWAY_EVENT_LABEL[type]} recorded`), onError: notifyError("Could not record the event") },
    );

  return (
    <SectionCard title="Airway & oxygen" data-testid="anesthesia-airway">
      <div className="space-y-4">
        <SegmentedControl
          options={DEVICE_OPTIONS}
          value={device}
          onValueChange={(next) => setup({ device: next })}
          aria-label="Airway device"
          disabled={!editable || add.isPending}
          data-testid="anesthesia-airway-device"
        />
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium" id="o2-label">
            O₂ flow
          </span>
          <Button
            variant="outline"
            size="icon-lg"
            className="size-11"
            aria-label="Decrease O₂ flow"
            disabled={!editable || add.isPending || o2Lpm <= 0}
            onClick={() => setup({ o2Lpm: Math.max(0, o2Lpm - O2_STEP) })}
          >
            <Minus />
          </Button>
          <output aria-labelledby="o2-label" className="w-20 text-center text-xl font-semibold tabular-nums" data-testid="anesthesia-o2">
            {o2Lpm} <span className="text-sm font-normal text-muted-foreground">L/min</span>
          </output>
          <Button
            variant="outline"
            size="icon-lg"
            className="size-11"
            aria-label="Increase O₂ flow"
            disabled={!editable || add.isPending || o2Lpm >= O2_MAX}
            onClick={() => setup({ o2Lpm: Math.min(O2_MAX, o2Lpm + O2_STEP) })}
          >
            <Plus />
          </Button>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Airway events">
            {EVENTS.map((type) => (
              <Button
                key={type}
                variant="outline"
                className="h-11"
                disabled={add.isPending}
                onClick={() => logEvent(type)}
                data-testid={`anesthesia-airway-${type}`}
              >
                <Wind /> {AIRWAY_EVENT_LABEL[type]}
              </Button>
            ))}
          </div>
        )}
        {record.airwayEvents.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {record.airwayEvents.map((event) => (
              <li key={event.id} className="flex gap-3">
                <time className="w-12 font-mono text-muted-foreground tabular-nums">{formatTime24(event.at)}</time>
                <span className="font-medium">{AIRWAY_EVENT_LABEL[event.type]}</span>
                {event.note && <span className="text-muted-foreground">{event.note}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No airway events.</p>
        )}
      </div>
    </SectionCard>
  );
}
