"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@asc/api-client";
import { useAdminOverview, useBookCase, useReferral } from "@asc/api-client/react";
import type { StaffMember } from "@asc/types";
import {
  AiBadge,
  Button,
  ErrorState,
  FormField,
  Input,
  LoadingSkeleton,
  OptionSelect,
  SegmentedControl,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
  toast,
} from "@asc/ui";
import { CalendarCheck, CircleAlert, Loader2 } from "@asc/ui/icons";
import {
  bookCaseFormSchema,
  bookCaseInputFrom,
  type BookCaseFormData,
} from "@asc/validation/cases/book";
import { bookingHintsFromReferral } from "../referrals/referral-prefill";
import { PatientPicker } from "./patient-picker";
import {
  DEFAULT_PRIMARY_PROCEDURE,
  DEFAULT_ROOM_ID,
  DEFAULT_START_TIME,
  DURATION_OPTIONS,
  GI_CPT_PROCEDURE_OPTIONS,
  INTENT_OPTIONS,
  ROOM_OPTIONS,
} from "./schedule-options";
import { useAuthStore } from "../../lib/stores/auth.store";

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

function defaultFutureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}


/** Right-side sheet to book a case; waits for staff (and the referral, if any) so defaults are complete. */
export function BookCaseSheet({ open, onOpenChange, defaults }: BookCaseSheetProps) {
  const admin = useAdminOverview();
  const referral = useReferral(defaults.referralId ?? null);
  const waitingForReferral = defaults.referralId !== undefined && referral.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        data-testid="book-case-sheet"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <CalendarCheck aria-hidden className="size-4 text-primary" /> Book case
          </SheetTitle>
          <SheetDescription>
            Schedule a surgical case into an operating room. The conflict engine validates room and provider availability.
          </SheetDescription>
        </SheetHeader>
        {(admin.isPending || waitingForReferral) && (
          <LoadingSkeleton variant="table" rows={6} className="p-4" />
        )}
        {admin.isError && (
          <ErrorState
            className="m-4"
            title="Could not load staff"
            onRetry={() => void admin.refetch()}
          />
        )}
        {admin.data && !waitingForReferral && (
          <BookCaseForm
            key={`${defaults.roomId ?? ""}-${defaults.startTime ?? ""}-${defaults.date ?? ""}-${defaults.patientId ?? ""}-${defaults.referralId ?? ""}`}
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
  readonly initialConflict?: string;
}

export function BookCaseForm({
  staff,
  defaults,
  referralHints,
  onDone,
  initialConflict,
}: BookCaseFormProps) {
  const router = useRouter();
  const book = useBookCase();
  const facilityId = useAuthStore((s) => s.facilityId) ?? "fac-metro";
  const [apiConflict, setApiConflict] = useState<string | null>(initialConflict ?? null);

  const defaultDate = defaults.date ?? defaultFutureDate();
  const defaultStartTime = defaults.startTime ?? DEFAULT_START_TIME;
  const intent = referralHints?.intent ?? "screening";

  const staffByRole = Object.groupBy(staff, (member) => member.role);
  const activeSurgeons = (staffByRole.SURGEON ?? []).filter((m) => m.active);
  const activeAnesthesiologists = (staffByRole.ANESTHESIOLOGIST ?? []).filter((m) => m.active);

  const defaultSurgeon = activeSurgeons[0]?.id ?? "";
  const defaultAnesthesia = "";

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BookCaseFormData>({
    resolver: zodResolver(bookCaseFormSchema),
    defaultValues: {
      facilityId,
      patientId: defaults.patientId ?? "",
      roomId: defaults.roomId ?? DEFAULT_ROOM_ID,
      date: defaultDate,
      startTime: defaultStartTime,
      durationMinutes: 45,
      procedureIntent: intent,
      primaryProcedureCode: DEFAULT_PRIMARY_PROCEDURE,
      primaryPhysicianId: defaultSurgeon,
      anesthesiologistId: defaultAnesthesia,
      notes: referralHints?.indication ?? "",
    },
  });

  const onSubmit = async (data: BookCaseFormData) => {
    setApiConflict(null);
    try {
      const payload = bookCaseInputFrom(data);
      const created = await book.mutateAsync(payload);
      toast.success("Case booked successfully", {
        description: `Case ${created.caseId} · Room ${data.roomId}`,
      });
      onDone();
      router.push(`/cases/${created.caseId}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const conflictMsg = error.message || "Operating room or physician has a conflicting schedule during this time.";
        setApiConflict(conflictMsg);
        toast.error("Schedule conflict", { description: conflictMsg });

        if (error.reasons) {
          for (const reason of error.reasons) {
            if (reason.code === "ROOM_DOUBLE_BOOKED") {
              setError("roomId", { type: "server", message: reason.message });
            } else if (reason.code === "PHYSICIAN_DOUBLE_BOOKED") {
              setError("primaryPhysicianId", { type: "server", message: reason.message });
            } else if (reason.code === "ANESTHESIA_DOUBLE_BOOKED") {
              setError("anesthesiologistId", { type: "server", message: reason.message });
            }
          }
        }
        return;
      }
      toast.error(error instanceof ApiError ? error.message : "Could not book the case.");
    }
  };

  const physicianOptions = activeSurgeons.map((member) => ({
    value: member.id,
    label: member.name,
    hint: member.title,
  }));

  const anesthesiaOptions = [
    { value: "", label: "None / Not assigned" },
    ...activeAnesthesiologists.map((member) => ({
      value: member.id,
      label: member.name,
      hint: member.title,
    })),
  ];

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      data-testid="book-case-form"
    >
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* HTTP 409 Conflict banner */}
        {apiConflict && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive"
            data-testid="book-case-conflict-alert"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">Scheduling Conflict (HTTP 409)</p>
              <p>{apiConflict}</p>
            </div>
          </div>
        )}

        {/* Patient combobox */}
        <FormField id="book-patient" label="Patient" error={errors.patientId?.message}>
          <Controller
            control={control}
            name="patientId"
            render={({ field }) => (
              <PatientPicker
                id="book-patient"
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(errors.patientId)}
              />
            )}
          />
        </FormField>

        {/* Room selector: room-1 through room-4 */}
        <FormField id="book-room" label="Operating Room" error={errors.roomId?.message}>
          <Controller
            control={control}
            name="roomId"
            render={({ field }) => (
              <SegmentedControl
                size="sm"
                aria-label="Operating Room"
                options={ROOM_OPTIONS}
                value={field.value}
                onValueChange={field.onChange}
                data-testid="book-case-room"
              />
            )}
          />
        </FormField>

        {/* Procedure intent */}
        <FormField id="book-intent" label="Procedure Intent" error={errors.procedureIntent?.message}>
          <Controller
            control={control}
            name="procedureIntent"
            render={({ field }) => (
              <SegmentedControl
                size="sm"
                aria-label="Procedure Intent"
                options={INTENT_OPTIONS}
                value={field.value}
                onValueChange={field.onChange}
                data-testid="book-case-intent"
              />
            )}
          />
        </FormField>

        {/* Primary procedure (CPT code) */}
        <FormField
          id="book-procedure"
          label="Primary Procedure (CPT)"
          error={errors.primaryProcedureCode?.message}
        >
          <Controller
            control={control}
            name="primaryProcedureCode"
            render={({ field }) => (
              <OptionSelect
                id="book-procedure"
                options={GI_CPT_PROCEDURE_OPTIONS}
                value={field.value}
                onValueChange={field.onChange}
                data-testid="book-case-procedure"
              />
            )}
          />
        </FormField>

        {/* Date & Scheduled Time */}
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
          <FormField id="book-date" label="Date" error={errors.date?.message}>
            <Input
              id="book-date"
              type="date"
              defaultValue={defaultDate}
              {...register("date")}
              data-testid="book-case-date"
            />
          </FormField>
          <FormField id="book-start" label="Start Time (24 h)" error={errors.startTime?.message}>
            <Input
              id="book-start"
              type="time"
              defaultValue={defaultStartTime}
              step={900}
              {...register("startTime")}
              className="tabular-nums"
              data-testid="book-case-start"
            />
          </FormField>
        </div>

        {/* Duration segmented control */}
        <FormField id="book-duration" label="Duration" error={errors.durationMinutes?.message}>
          <Controller
            control={control}
            name="durationMinutes"
            render={({ field }) => (
              <SegmentedControl
                size="sm"
                aria-label="Duration"
                options={DURATION_OPTIONS}
                value={field.value}
                onValueChange={field.onChange}
                data-testid="book-case-duration"
              />
            )}
          />
        </FormField>

        {/* Physician & Anesthesia */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="book-physician"
            label="Primary Physician"
            error={errors.primaryPhysicianId?.message}
          >
            <Controller
              control={control}
              name="primaryPhysicianId"
              render={({ field }) => (
                <OptionSelect
                  id="book-physician"
                  options={physicianOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                  data-testid="book-case-physician"
                />
              )}
            />
          </FormField>
          <FormField
            id="book-anesthesia"
            label="Anesthesiologist (Optional)"
            error={errors.anesthesiologistId?.message}
          >
            <Controller
              control={control}
              name="anesthesiologistId"
              render={({ field }) => (
                <OptionSelect
                  id="book-anesthesia"
                  options={anesthesiaOptions}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  data-testid="book-case-anesthesia"
                />
              )}
            />
          </FormField>
        </div>

        {/* Clinical notes */}
        <FormField
          id="book-notes"
          label="Clinical Notes"
          error={errors.notes?.message}
          labelAction={referralHints ? <AiBadge label="From referral" /> : undefined}
        >
          <Textarea
            id="book-notes"
            rows={3}
            placeholder="Pre-procedure notes, clinical indication, or special considerations…"
            {...register("notes")}
            aria-invalid={errors.notes ? true : undefined}
            data-testid="book-case-notes"
          />
        </FormField>
      </div>

      <SheetFooter className="flex-row justify-end border-t border-border">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || book.isPending}
          data-testid="book-case-submit"
        >
          {(isSubmitting || book.isPending) && <Loader2 aria-hidden className="animate-spin" />}
          Book case
        </Button>
      </SheetFooter>
    </form>
  );
}
