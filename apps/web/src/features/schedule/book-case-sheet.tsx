"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@asc/api-client";
import { useAdminOverview, useBookCase, useReferral, useSchedule } from "@asc/api-client/react";
import { findScheduleConflicts } from "@asc/clinical-rules";
import { todayIsoDate } from "@asc/clinical-rules/time";
import type { ConflictCheckResult, ScheduleConflict, StaffMember } from "@asc/types";
import {
  AiBadge,
  Button,
  ErrorState,
  FormField,
  GateChecklist,
  Input,
  LoadingSkeleton,
  OptionSelect,
  SegmentedControl,
  type SegmentedOption,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
  toast,
} from "@asc/ui";
import { CalendarCheck, Loader2 } from "@asc/ui/icons";
import { bookCasePayloadFrom, bookCaseSchema, localDateTimeToIso, type BookCaseFormData } from "@asc/validation/schedule";
import { bookingHintsFromReferral } from "../referrals/referral-prefill";
import { PatientPicker } from "./patient-picker";
import {
  DEFAULT_INDICATION,
  DEFAULT_ROOM_ID,
  DEFAULT_START_TIME,
  DURATION_OPTIONS,
  INTENT_OPTIONS,
  PROCEDURE_OPTIONS,
  TEAM_FIELDS,
} from "./schedule-options";

interface BookCaseSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Prefill (ids only): from a slot click, a referral or a patient chart. */
  readonly defaults: {
    readonly patientId?: string;
    readonly referralId?: string;
    readonly date?: string;
    readonly roomId?: string;
    readonly startTime?: string;
  };
}

const CONFLICT_CHECKS: readonly { readonly kind: ScheduleConflict["kind"]; readonly label: string }[] = [
  { kind: "room", label: "Room free" },
  { kind: "surgeon", label: "Gastroenterologist free" },
  { kind: "anesthesia", label: "Anesthesia free" },
  { kind: "nurse", label: "Nurse free" },
  { kind: "patient", label: "No overlapping case for this patient" },
];

const ROOM_OPTIONS: readonly SegmentedOption<string>[] = [
  { value: "room-1", label: "Room 1" },
  { value: "room-2", label: "Room 2" },
  { value: "room-3", label: "Room 3" },
];

/** Conflict result as a checklist (every probe ✓/✗, reasons under failures). */
function withChecks(result: ConflictCheckResult): ConflictCheckResult {
  return {
    ...result,
    checks: CONFLICT_CHECKS.map(({ kind, label }) => ({
      code: `CONFLICT_${kind.toUpperCase()}`,
      label,
      ok: !result.conflicts.some((conflict) => conflict.kind === kind),
    })),
  };
}

function firstOfRole(staff: readonly StaffMember[], role: StaffMember["role"]): string {
  return staff.find((member) => member.role === role && member.active)?.id ?? "";
}

/** Right-side sheet to book a case; waits for staff (and the referral, if any) so defaults are complete. */
export function BookCaseSheet({ open, onOpenChange, defaults }: BookCaseSheetProps) {
  const admin = useAdminOverview();
  const referral = useReferral(defaults.referralId ?? null);
  const waitingForReferral = defaults.referralId !== undefined && referral.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl" data-testid="book-case-sheet">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <CalendarCheck aria-hidden className="size-4 text-primary" /> Book case
          </SheetTitle>
          <SheetDescription>Room, time and team are checked for conflicts as you type. The API re-checks on save.</SheetDescription>
        </SheetHeader>
        {(admin.isPending || waitingForReferral) && <LoadingSkeleton variant="table" rows={6} className="p-4" />}
        {admin.isError && <ErrorState className="m-4" title="Could not load staff" onRetry={() => void admin.refetch()} />}
        {admin.data && !waitingForReferral && (
          <BookCaseForm
            staff={admin.data.staff}
            defaults={defaults}
            referralHints={referral.data ? bookingHintsFromReferral(referral.data) : null}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface BookCaseFormProps {
  readonly staff: readonly StaffMember[];
  readonly defaults: BookCaseSheetProps["defaults"];
  readonly referralHints: ReturnType<typeof bookingHintsFromReferral> | null;
  readonly onDone: () => void;
}

function BookCaseForm({ staff, defaults, referralHints, onDone }: BookCaseFormProps) {
  const router = useRouter();
  const book = useBookCase();
  const intent = referralHints?.intent ?? "screening";
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BookCaseFormData>({
    resolver: zodResolver(bookCaseSchema),
    defaultValues: {
      patientId: defaults.patientId ?? "",
      referralId: defaults.referralId,
      procedure: referralHints?.procedure ?? "COLONOSCOPY",
      intent,
      indication: referralHints?.indication || DEFAULT_INDICATION[intent],
      roomId: defaults.roomId ?? DEFAULT_ROOM_ID,
      date: defaults.date ?? todayIsoDate(),
      startTime: defaults.startTime ?? DEFAULT_START_TIME,
      durationMin: "45",
      surgeonId: firstOfRole(staff, "SURGEON"),
      anesthesiaId: firstOfRole(staff, "ANESTHESIOLOGIST"),
      nurseId: firstOfRole(staff, "NURSE"),
    },
  });
  const values = useWatch({ control });
  const schedule = useSchedule(values.date || undefined);

  const ready = Boolean(values.patientId && values.roomId && values.date && values.startTime && values.durationMin);
  const conflicts =
    ready && schedule.data
      ? withChecks(
          findScheduleConflicts(schedule.data.cases, {
            patientId: values.patientId ?? "",
            roomId: values.roomId ?? "",
            scheduledStart: localDateTimeToIso(values.date ?? "", values.startTime ?? ""),
            durationMin: Number(values.durationMin),
            surgeonId: values.surgeonId ?? "",
            anesthesiaId: values.anesthesiaId ?? "",
            nurseId: values.nurseId ?? "",
          }),
        )
      : null;

  const onSubmit = async (data: BookCaseFormData) => {
    try {
      const created = await book.mutateAsync(bookCasePayloadFrom(data));
      toast.success(`Case ${created.caseNumber} booked`, { description: `${created.procedureLabel} · ${created.roomId.replace("room-", "Room ")}` });
      onDone();
      router.push(`/cases/${created.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not book the case.");
    }
  };

  const teamOptions = (role: StaffMember["role"]) =>
    staff.filter((member) => member.role === role && member.active).map((member) => ({ value: member.id, label: member.name, hint: member.title }));

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="flex min-h-0 flex-1 flex-col" data-testid="book-case-form">
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <FormField id="book-patient" label="Patient" error={errors.patientId?.message}>
          <Controller
            control={control}
            name="patientId"
            render={({ field }) => <PatientPicker id="book-patient" value={field.value} onChange={field.onChange} invalid={Boolean(errors.patientId)} />}
          />
        </FormField>

        <div className="grid gap-4">
          <FormField id="book-procedure" label="Procedure" error={errors.procedure?.message}>
            <Controller
              control={control}
              name="procedure"
              render={({ field }) => (
                <OptionSelect id="book-procedure" options={PROCEDURE_OPTIONS} value={field.value} onValueChange={field.onChange} data-testid="book-case-procedure" />
              )}
            />
          </FormField>
          <FormField id="book-intent" label="Intent" error={errors.intent?.message}>
            <Controller
              control={control}
              name="intent"
              render={({ field }) => (
                <SegmentedControl size="sm" aria-label="Intent" options={INTENT_OPTIONS} value={field.value} onValueChange={field.onChange} data-testid="book-case-intent" />
              )}
            />
          </FormField>
        </div>

        <FormField
          id="book-indication"
          label="Indication"
          error={errors.indication?.message}
          labelAction={referralHints ? <AiBadge label="From referral" /> : undefined}
        >
          <Textarea id="book-indication" rows={2} {...register("indication")} aria-invalid={errors.indication ? true : undefined} data-testid="book-case-indication" />
        </FormField>

        <FormField id="book-room" label="Room" error={errors.roomId?.message}>
          <Controller
            control={control}
            name="roomId"
            render={({ field }) => (
              <SegmentedControl size="sm" aria-label="Room" options={ROOM_OPTIONS} value={field.value} onValueChange={field.onChange} data-testid="book-case-room" />
            )}
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
          <FormField id="book-date" label="Date" error={errors.date?.message}>
            <Input id="book-date" type="date" {...register("date")} data-testid="book-case-date" />
          </FormField>
          <FormField id="book-start" label="Start (24 h)" error={errors.startTime?.message}>
            <Input id="book-start" type="time" step={900} {...register("startTime")} className="tabular-nums" data-testid="book-case-start" />
          </FormField>
        </div>

        <FormField id="book-duration" label="Duration" error={errors.durationMin?.message}>
          <Controller
            control={control}
            name="durationMin"
            render={({ field }) => (
              <SegmentedControl size="sm" aria-label="Duration" options={DURATION_OPTIONS} value={field.value} onValueChange={field.onChange} data-testid="book-case-duration" />
            )}
          />
        </FormField>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-xs font-medium text-muted-foreground">Team</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEAM_FIELDS.map((slot) => (
              <FormField key={slot.name} id={`book-${slot.name}`} label={slot.label} error={errors[slot.name]?.message}>
                <Controller
                  control={control}
                  name={slot.name}
                  render={({ field }) => (
                    <OptionSelect
                      id={`book-${slot.name}`}
                      options={teamOptions(slot.role)}
                      value={field.value}
                      onValueChange={field.onChange}
                      data-testid={`book-case-${slot.name}`}
                    />
                  )}
                />
              </FormField>
            ))}
          </div>
        </fieldset>

        <section aria-live="polite" className="rounded-lg border border-border bg-muted/30 p-3" data-testid="book-case-conflicts">
          {conflicts ? (
            <GateChecklist result={conflicts} title="Conflict check" />
          ) : (
            <p className="text-sm text-muted-foreground">Choose a patient, room and time to check conflicts.</p>
          )}
        </section>
      </div>

      <SheetFooter className="flex-row justify-end border-t border-border">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={book.isPending || conflicts?.ok === false} data-testid="book-case-submit">
          {book.isPending && <Loader2 aria-hidden className="animate-spin" />}
          Book case
        </Button>
      </SheetFooter>
    </form>
  );
}
