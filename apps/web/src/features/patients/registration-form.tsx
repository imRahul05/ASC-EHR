"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@asc/api-client";
import { useRegisterPatient } from "@asc/api-client/react";
import type { DuplicateMatchResult, RegisterPatientResult } from "@asc/types";
import {
  Button,
  FormField,
  Input,
  OptionSelect,
  SectionCard,
  SegmentedControl,
  Switch,
  toast,
} from "@asc/ui";
import { Loader2, TriangleAlert, UserPlus } from "@asc/ui/icons";
import {
  registerPatientSchema,
  type RegisterPatientInput,
} from "@asc/validation/patients/register";
import { useAuthStore } from "../../lib/stores/auth.store";
import { DuplicateMatchDialog } from "./duplicate-match-dialog";

interface RegistrationFormProps {
  readonly onSuccess?: (result: RegisterPatientResult) => void;
  readonly defaultFacilityId?: string;
}

interface FormUiState {
  readonly hasInsurance: boolean;
  readonly hasEscort: boolean;
  readonly isConflictOpen: boolean;
  readonly conflictCode: "duplicate_mrn_conflict" | "duplicate_patient_detected" | null;
  readonly duplicateMatch: DuplicateMatchResult | null;
  readonly pendingSubmission: RegisterPatientInput | null;
}

const INITIAL_UI_STATE: FormUiState = {
  hasInsurance: false,
  hasEscort: false,
  isConflictOpen: false,
  conflictCode: null,
  duplicateMatch: null,
  pendingSubmission: null,
};

const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "unknown", label: "Unknown" },
] as const;

const RELATIONSHIP_OPTIONS = [
  { value: "self", label: "Self" },
  { value: "spouse", label: "Spouse" },
  { value: "child", label: "Child" },
  { value: "other", label: "Other" },
] as const;

export function RegistrationForm({ onSuccess, defaultFacilityId }: RegistrationFormProps) {
  const activeFacilityId = useAuthStore((s) => s.facilityId);
  const facilityId = defaultFacilityId ?? activeFacilityId ?? undefined;

  const [uiState, setUiState] = useState<FormUiState>(INITIAL_UI_STATE);
  const registerMutation = useRegisterPatient();

  const {
    control,
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<RegisterPatientInput>({
    resolver: zodResolver(registerPatientSchema),
    defaultValues: {
      facilityId,
      name: { family: "", given: [""] },
      dateOfBirth: "",
      gender: "female",
      phone: "",
      email: "",
      mrn: "",
      address: { line: [""], city: "", state: "", postalCode: "", country: "USA" },
      insurance: undefined,
      escort: undefined,
    },
  });

  const preparePayload = (
    data: RegisterPatientInput,
    confirmDuplicateOverride = false,
  ): RegisterPatientInput => {
    // Sanitize address: if all fields blank, do NOT send empty object [{}]
    const line0 = data.address?.line?.[0]?.trim();
    const city = data.address?.city?.trim();
    const state = data.address?.state?.trim();
    const postalCode = data.address?.postalCode?.trim();
    const country = data.address?.country?.trim();

    const hasAddressFields = Boolean(line0 || city || state || postalCode);
    const address = hasAddressFields
      ? {
          ...(line0 ? { line: [line0] } : {}),
          ...(city ? { city } : {}),
          ...(state ? { state } : {}),
          ...(postalCode ? { postalCode } : {}),
          ...(country ? { country } : {}),
        }
      : undefined;

    // Sanitize insurance
    let insurance = undefined;
    if (
      uiState.hasInsurance &&
      data.insurance &&
      data.insurance.payerId?.trim() &&
      data.insurance.memberId?.trim()
    ) {
      insurance = {
        payerId: data.insurance.payerId.trim(),
        planName: data.insurance.planName?.trim() || undefined,
        memberId: data.insurance.memberId.trim(),
        groupNumber: data.insurance.groupNumber?.trim() || undefined,
        relationship: data.insurance.relationship,
      };
    }

    // Sanitize escort
    let escort = undefined;
    if (
      uiState.hasEscort &&
      data.escort &&
      data.escort.name?.trim() &&
      data.escort.phone?.trim() &&
      data.escort.relationship?.trim()
    ) {
      escort = {
        name: data.escort.name.trim(),
        relationship: data.escort.relationship.trim(),
        phone: data.escort.phone.trim(),
      };
    }

    return {
      facilityId,
      name: {
        family: data.name.family.trim(),
        given: [data.name.given[0]?.trim() ?? ""],
      },
      dateOfBirth: data.dateOfBirth,
      gender: data.gender,
      phone: data.phone.trim(),
      email: data.email?.trim() || undefined,
      mrn: data.mrn?.trim() || undefined,
      address,
      insurance,
      escort,
      confirmDuplicate: confirmDuplicateOverride,
    };
  };

  const executeRegistration = async (payload: RegisterPatientInput) => {
    clearErrors("root");
    try {
      const result = await registerMutation.mutateAsync(payload);
      toast.success("Patient registered successfully", {
        description: `Chart created for ${payload.name.family}, ${payload.name.given[0]}`,
      });
      setUiState((prev) => ({ ...prev, isConflictOpen: false }));
      onSuccess?.(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        if (error.code === "duplicate_mrn_conflict") {
          setUiState((prev) => ({
            ...prev,
            conflictCode: "duplicate_mrn_conflict",
            duplicateMatch: error.duplicateMatch ?? null,
            pendingSubmission: payload,
            isConflictOpen: true,
          }));
          return;
        }
        if (error.code === "duplicate_patient_detected" || error.duplicateMatch?.hasMatch) {
          setUiState((prev) => ({
            ...prev,
            conflictCode: "duplicate_patient_detected",
            duplicateMatch: error.duplicateMatch ?? null,
            pendingSubmission: payload,
            isConflictOpen: true,
          }));
          return;
        }
      }
      const message =
        error instanceof ApiError ? error.message : "Failed to register patient. Please try again.";
      setError("root", { message });
    }
  };

  const onSubmit = async (data: RegisterPatientInput) => {
    const payload = preparePayload(data, false);
    await executeRegistration(payload);
  };

  const handleConfirmAnyway = async () => {
    if (!uiState.pendingSubmission) return;
    const confirmedPayload: RegisterPatientInput = {
      ...uiState.pendingSubmission,
      confirmDuplicate: true,
    };
    await executeRegistration(confirmedPayload);
  };

  const submittedSummaryData = {
    firstName: uiState.pendingSubmission?.name.given[0] ?? "",
    lastName: uiState.pendingSubmission?.name.family ?? "",
    dateOfBirth: uiState.pendingSubmission?.dateOfBirth ?? "",
    gender: uiState.pendingSubmission?.gender ?? "",
    phone: uiState.pendingSubmission?.phone ?? "",
    mrn: uiState.pendingSubmission?.mrn,
    address: uiState.pendingSubmission?.address,
  };

  const isBusy = isSubmitting || registerMutation.isPending;

  return (
    <>
      <form
        onSubmit={(e) => void handleSubmit(onSubmit)(e)}
        noValidate
        className="space-y-6"
        data-testid="registration-form"
      >
        {errors.root && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="registration-error-banner"
          >
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            <span>{errors.root.message}</span>
          </div>
        )}

        {/* 1. Demographics */}
        <SectionCard
          title="Demographics"
          description="Primary legal identity and contact info. MRN is optional; one is auto-generated if omitted."
          data-testid="registration-section-demographics"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="reg-first-name"
              label="First name *"
              error={errors.name?.given?.[0]?.message ?? errors.name?.given?.message}
            >
              <Input
                id="reg-first-name"
                placeholder="Jane"
                autoComplete="given-name"
                aria-invalid={errors.name?.given ? true : undefined}
                data-testid="reg-first-name"
                {...register("name.given.0")}
              />
            </FormField>

            <FormField
              id="reg-last-name"
              label="Last name *"
              error={errors.name?.family?.message}
            >
              <Input
                id="reg-last-name"
                placeholder="Doe"
                autoComplete="family-name"
                aria-invalid={errors.name?.family ? true : undefined}
                data-testid="reg-last-name"
                {...register("name.family")}
              />
            </FormField>

            <FormField
              id="reg-dob"
              label="Date of birth *"
              error={errors.dateOfBirth?.message}
            >
              <Input
                id="reg-dob"
                type="date"
                autoComplete="bday"
                aria-invalid={errors.dateOfBirth ? true : undefined}
                data-testid="reg-dob"
                {...register("dateOfBirth")}
              />
            </FormField>

            <FormField id="reg-gender" label="Gender *" error={errors.gender?.message}>
              <Controller
                control={control}
                name="gender"
                render={({ field }) => (
                  <SegmentedControl
                    size="sm"
                    aria-label="Gender"
                    options={GENDER_OPTIONS}
                    value={field.value}
                    onValueChange={field.onChange}
                    data-testid="reg-gender"
                  />
                )}
              />
            </FormField>

            <FormField id="reg-phone" label="Phone number *" error={errors.phone?.message}>
              <Input
                id="reg-phone"
                type="tel"
                placeholder="(555) 123-4567"
                autoComplete="tel"
                aria-invalid={errors.phone ? true : undefined}
                data-testid="reg-phone"
                {...register("phone")}
              />
            </FormField>

            <FormField id="reg-email" label="Email address (optional)" error={errors.email?.message}>
              <Input
                id="reg-email"
                type="email"
                placeholder="jane.doe@example.com"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                data-testid="reg-email"
                {...register("email")}
              />
            </FormField>

            <FormField
              id="reg-mrn"
              label="Medical Record Number (MRN)"
              error={errors.mrn?.message}
              className="sm:col-span-2"
            >
              <Input
                id="reg-mrn"
                placeholder="Leave blank to generate automatically"
                autoComplete="off"
                className="font-mono"
                aria-invalid={errors.mrn ? true : undefined}
                data-testid="reg-mrn"
                {...register("mrn")}
              />
            </FormField>
          </div>
        </SectionCard>

        {/* 2. Contact & Address */}
        <SectionCard
          title="Contact & Address"
          description="Residential address. Optional for registration; required for claims and billing."
          data-testid="registration-section-address"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="reg-street"
              label="Street address"
              className="sm:col-span-2"
              error={errors.address?.line?.message}
            >
              <Input
                id="reg-street"
                placeholder="123 Health Ave, Apt 4"
                autoComplete="street-address"
                data-testid="reg-street"
                {...register("address.line.0")}
              />
            </FormField>

            <FormField id="reg-city" label="City" error={errors.address?.city?.message}>
              <Input
                id="reg-city"
                placeholder="Metropolis"
                autoComplete="address-level2"
                data-testid="reg-city"
                {...register("address.city")}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-2">
              <FormField id="reg-state" label="State" error={errors.address?.state?.message}>
                <Input
                  id="reg-state"
                  placeholder="NY"
                  maxLength={2}
                  autoComplete="address-level1"
                  data-testid="reg-state"
                  {...register("address.state")}
                />
              </FormField>

              <FormField id="reg-zip" label="ZIP code" error={errors.address?.postalCode?.message}>
                <Input
                  id="reg-zip"
                  placeholder="10001"
                  maxLength={10}
                  className="font-mono"
                  autoComplete="postal-code"
                  data-testid="reg-zip"
                  {...register("address.postalCode")}
                />
              </FormField>
            </div>
          </div>
        </SectionCard>

        {/* 3. Insurance & Coverage */}
        <SectionCard
          title="Insurance & Coverage"
          description="Payer policy and member ID. An eligibility check stub runs on creation."
          data-testid="registration-section-insurance"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Capture insurance coverage</p>
                <p className="text-xs text-muted-foreground">
                  Uncheck for self-pay or uninsured patients.
                </p>
              </div>
              <Switch
                id="reg-has-insurance"
                checked={uiState.hasInsurance}
                onCheckedChange={(checked) =>
                  setUiState((prev) => ({ ...prev, hasInsurance: checked }))
                }
                data-testid="reg-has-insurance-toggle"
              />
            </div>

            {uiState.hasInsurance && (
              <div className="grid gap-4 sm:grid-cols-2 pt-2" data-testid="reg-insurance-fields">
                <FormField
                  id="reg-payer-id"
                  label="Payer name / ID *"
                  error={errors.insurance?.payerId?.message}
                >
                  <Input
                    id="reg-payer-id"
                    placeholder="e.g. Aetna, BCBS, or PAYER-01"
                    data-testid="reg-payer-id"
                    {...register("insurance.payerId")}
                  />
                </FormField>

                <FormField
                  id="reg-plan-name"
                  label="Plan name (optional)"
                  error={errors.insurance?.planName?.message}
                >
                  <Input
                    id="reg-plan-name"
                    placeholder="e.g. Choice POS II"
                    data-testid="reg-plan-name"
                    {...register("insurance.planName")}
                  />
                </FormField>

                <FormField
                  id="reg-member-id"
                  label="Member ID *"
                  error={errors.insurance?.memberId?.message}
                >
                  <Input
                    id="reg-member-id"
                    placeholder="e.g. W123456789"
                    className="font-mono"
                    data-testid="reg-member-id"
                    {...register("insurance.memberId")}
                  />
                </FormField>

                <FormField
                  id="reg-group-number"
                  label="Group number (optional)"
                  error={errors.insurance?.groupNumber?.message}
                >
                  <Input
                    id="reg-group-number"
                    placeholder="e.g. GRP-9988"
                    className="font-mono"
                    data-testid="reg-group-number"
                    {...register("insurance.groupNumber")}
                  />
                </FormField>

                <FormField
                  id="reg-relationship"
                  label="Policy holder relationship"
                  error={errors.insurance?.relationship?.message}
                >
                  <Controller
                    control={control}
                    name="insurance.relationship"
                    render={({ field }) => (
                      <OptionSelect
                        id="reg-relationship"
                        options={RELATIONSHIP_OPTIONS}
                        value={field.value ?? "self"}
                        onValueChange={field.onChange}
                        data-testid="reg-relationship"
                      />
                    )}
                  />
                </FormField>
              </div>
            )}
          </div>
        </SectionCard>

        {/* 4. Escort & Responsible Adult */}
        <SectionCard
          title="Escort / Responsible Adult"
          description="Responsible adult who will accompany the patient home following anesthesia."
          data-testid="registration-section-escort"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Record escort details</p>
                <p className="text-xs text-muted-foreground">
                  Escort confirmation is required prior to sedation.
                </p>
              </div>
              <Switch
                id="reg-has-escort"
                checked={uiState.hasEscort}
                onCheckedChange={(checked) =>
                  setUiState((prev) => ({ ...prev, hasEscort: checked }))
                }
                data-testid="reg-has-escort-toggle"
              />
            </div>

            {uiState.hasEscort && (
              <div className="grid gap-4 sm:grid-cols-2 pt-2" data-testid="reg-escort-fields">
                <FormField
                  id="reg-escort-name"
                  label="Escort full name *"
                  error={errors.escort?.name?.message}
                >
                  <Input
                    id="reg-escort-name"
                    placeholder="John Doe"
                    data-testid="reg-escort-name"
                    {...register("escort.name")}
                  />
                </FormField>

                <FormField
                  id="reg-escort-relationship"
                  label="Relationship *"
                  error={errors.escort?.relationship?.message}
                >
                  <Input
                    id="reg-escort-relationship"
                    placeholder="e.g. Spouse, Parent, Sibling"
                    data-testid="reg-escort-relationship"
                    {...register("escort.relationship")}
                  />
                </FormField>

                <FormField
                  id="reg-escort-phone"
                  label="Escort phone number *"
                  error={errors.escort?.phone?.message}
                >
                  <Input
                    id="reg-escort-phone"
                    type="tel"
                    placeholder="(555) 987-6543"
                    data-testid="reg-escort-phone"
                    {...register("escort.phone")}
                  />
                </FormField>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Button
            type="submit"
            disabled={isBusy}
            className="min-w-36 gap-2"
            data-testid="registration-submit-button"
          >
            {isBusy ? (
              <>
                <Loader2 aria-hidden className="size-4 animate-spin" />
                Registering…
              </>
            ) : (
              <>
                <UserPlus aria-hidden className="size-4" />
                Register Patient
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Duplicate Conflict & Match Dialog */}
      <DuplicateMatchDialog
        open={uiState.isConflictOpen}
        onOpenChange={(open) => setUiState((prev) => ({ ...prev, isConflictOpen: open }))}
        conflictCode={uiState.conflictCode}
        duplicateMatch={uiState.duplicateMatch}
        submittedData={submittedSummaryData}
        onConfirmAnyway={() => void handleConfirmAnyway()}
        isSubmitting={isBusy}
      />
    </>
  );
}
