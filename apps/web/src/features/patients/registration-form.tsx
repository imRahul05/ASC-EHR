"use client";

import { useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@asc/api-client";
import { medClassFor } from "@asc/clinical-rules";
import { useConvertReferral, useCreatePatient, useDuplicateCheck } from "@asc/api-client/react";
import type { Patient, Referral } from "@asc/types";
import { AiBadge, Button, Checkbox, cn, FormField, Input, OptionSelect, SectionCard, SegmentedControl, Switch, toast } from "@asc/ui";
import { Loader2, TriangleAlert, UserPlus } from "@asc/ui/icons";
import {
  EMPTY_PATIENT_REGISTRATION,
  patientRegistrationSchema,
  parseMedicationText,
  toCreatePatientPayload,
  type PatientRegistrationFormData,
} from "@asc/validation/patient";
import { DuplicatePanel } from "./duplicate-panel";
import { DUPLICATE_KEYS, REGISTRATION_SECTIONS, RELATIONSHIP_OPTIONS, SEX_OPTIONS } from "./registration-fields";

interface RegistrationFormProps {
  readonly defaults: PatientRegistrationFormData;
  /** Registering from a fax referral: fields came from AI extraction; submit converts the referral. */
  readonly referral: Referral | null;
  readonly onCreated: (patient: Patient, how: "created" | "linked") => void;
}

type SectionId = (typeof REGISTRATION_SECTIONS)[number]["id"];

const DOB_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Registration form: config-driven sections, duplicate check on blur + before create, referral conversion. */
export function RegistrationForm({ defaults, referral, onCreated }: RegistrationFormProps) {
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const duplicates = useDuplicateCheck();
  const create = useCreatePatient();
  const convert = useConvertReferral(referral?.id ?? "");
  const {
    control,
    register,
    handleSubmit,
    getValues,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<PatientRegistrationFormData>({ resolver: zodResolver(patientRegistrationSchema), defaultValues: defaults });

  const identity = () => ({ firstName: getValues("firstName").trim(), lastName: getValues("lastName").trim(), dateOfBirth: getValues("dateOfBirth") });
  const canCheck = () => {
    const { firstName, lastName, dateOfBirth } = identity();
    return firstName !== "" && lastName !== "" && DOB_PATTERN.test(dateOfBirth);
  };
  const runDuplicateCheck = () => {
    if (!canCheck()) return;
    setDuplicateAcknowledged(false);
    duplicates.mutate(identity());
  };

  const onSubmit = async (data: PatientRegistrationFormData) => {
    try {
      const check = await duplicates.mutateAsync(identity());
      if (check.matches.length > 0 && !duplicateAcknowledged) {
        setError("root", { message: "Possible duplicate chart found. Link the referral / open the existing chart, or confirm this is a different person." });
        return;
      }
      const medications = parseMedicationText(data.medications).map((med) => ({ ...med, medClass: medClassFor(med.name) }));
      const payload = { ...toCreatePatientPayload(data, referral?.id), medications };
      const patient = referral ? (await convert.mutateAsync({ patient: payload })).patient : await create.mutateAsync(payload);
      toast.success(`Registered ${patient.mrn}`, { description: referral ? "Referral converted — run eligibility next." : "Run eligibility next." });
      onCreated(patient, "created");
    } catch (error) {
      setError("root", { message: error instanceof ApiError ? error.message : "Registration failed. Try again." });
    }
  };

  const linkExisting = async (patientId: string) => {
    try {
      const result = await convert.mutateAsync({ patientId });
      toast.success(`Referral linked to ${result.patient.mrn}`);
      onCreated(result.patient, "linked");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not link the referral.");
    }
  };

  const fromReferral = (name: keyof PatientRegistrationFormData) =>
    referral !== null && (name === "sex" || defaults[name] !== EMPTY_PATIENT_REGISTRATION[name]) ? (
      <AiBadge label="From fax" className="h-4 px-1.5 text-[10px]" />
    ) : undefined;

  const extras: Readonly<Record<SectionId, ReactNode>> = {
    demographics: (
      <FormField id="reg-sex" label="Sex" error={errors.sex?.message} labelAction={fromReferral("sex")} className="sm:col-span-2">
        <Controller
          control={control}
          name="sex"
          render={({ field }) => (
            <SegmentedControl size="sm" aria-label="Sex" options={SEX_OPTIONS} value={field.value} onValueChange={field.onChange} data-testid="reg-sex" />
          )}
        />
      </FormField>
    ),
    address: null,
    coverage: (
      <FormField id="reg-subscriber" label="Subscriber relationship" error={errors.subscriberRelationship?.message}>
        <Controller
          control={control}
          name="subscriberRelationship"
          render={({ field }) => (
            <OptionSelect id="reg-subscriber" options={RELATIONSHIP_OPTIONS} value={field.value} onValueChange={field.onChange} data-testid="reg-subscriber" />
          )}
        />
      </FormField>
    ),
    escort: (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 sm:col-span-2">
        <label htmlFor="reg-escort-confirmed" className="text-sm">
          Escort confirmed by phone
          <span className="block text-xs text-muted-foreground">Required before the case can be confirmed.</span>
        </label>
        <Controller
          control={control}
          name="escortConfirmed"
          render={({ field }) => (
            <Switch id="reg-escort-confirmed" checked={field.value} onCheckedChange={field.onChange} data-testid="reg-escort-confirmed" />
          )}
        />
      </div>
    ),
    clinical: null,
  };

  const busy = isSubmitting || create.isPending || convert.isPending;
  const hasMatches = (duplicates.data?.matches.length ?? 0) > 0;

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]" data-testid="registration-form">
      <div className="min-w-0 space-y-4">
        {REGISTRATION_SECTIONS.map((section) => (
          <SectionCard key={section.id} title={section.title} description={section.description} data-testid={`registration-section-${section.id}`}>
            <div className="grid gap-3 sm:grid-cols-2">
              {section.fields.map((field) => {
                const id = `reg-${field.name}`;
                const blur = (DUPLICATE_KEYS as readonly string[]).includes(field.name) ? { onBlur: runDuplicateCheck } : {};
                return (
                  <FormField key={field.name} id={id} label={field.label} error={errors[field.name]?.message} labelAction={fromReferral(field.name)}>
                    <Input
                      id={id}
                      type={"type" in field ? field.type : "text"}
                      placeholder={"placeholder" in field ? field.placeholder : undefined}
                      autoComplete={"autoComplete" in field ? field.autoComplete : "off"}
                      maxLength={"maxLength" in field ? field.maxLength : undefined}
                      aria-invalid={errors[field.name] ? true : undefined}
                      className={cn("mono" in field && field.mono && "font-mono")}
                      data-testid={id}
                      {...register(field.name, blur)}
                    />
                  </FormField>
                );
              })}
              {extras[section.id]}
            </div>
          </SectionCard>
        ))}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <DuplicatePanel
          status={duplicates.status}
          matches={duplicates.data?.matches ?? []}
          canRun
          onRun={runDuplicateCheck}
          onLink={referral ? (patientId) => void linkExisting(patientId) : undefined}
          linkPending={convert.isPending}
        />

        <SectionCard>
          <div className="space-y-3">
            {errors.root && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {errors.root.message}
              </p>
            )}
            {hasMatches && (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="reg-duplicate-ack"
                  checked={duplicateAcknowledged}
                  onCheckedChange={(checked) => {
                    setDuplicateAcknowledged(checked === true);
                    clearErrors("root");
                  }}
                  data-testid="registration-duplicate-acknowledge"
                />
                <label htmlFor="reg-duplicate-ack" className="text-xs text-muted-foreground">
                  I reviewed the matches — this is a different person.
                </label>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy} data-testid="registration-submit">
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : <UserPlus aria-hidden />}
              {referral ? "Create patient from referral" : "Register patient"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {referral ? "AI-extracted values are drafts — verify each against the fax before saving." : "Eligibility (270/271) runs on the next step."}
            </p>
          </div>
        </SectionCard>
      </aside>
    </form>
  );
}
