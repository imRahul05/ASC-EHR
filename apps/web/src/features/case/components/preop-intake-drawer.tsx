"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useSubmitPreopAssessment } from "@asc/api-client/react";
import type { PreopAssessmentInput } from "@asc/validation/preop";
import {
  AlertCircle,
  CheckCircle2,
  HeartPulse,
  LoaderCircle,
  ShieldAlert,
  UserCheck,
} from "@asc/ui/icons";
import {
  Button,
  Checkbox,
  FormField,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  toast,
} from "@asc/ui";

interface PreopIntakeDrawerProps {
  readonly caseId: string;
  readonly facilityId?: string;
  readonly patientName: string;
  readonly defaultEscort?: {
    readonly name?: string;
    readonly relationship?: string;
    readonly phone?: string;
  } | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

type IvSite = "left_hand" | "right_hand" | "left_forearm" | "right_forearm" | "left_ac" | "right_ac";
type IvGauge = 18 | 20 | 22;

interface PreopDraftState {
  sbp: string;
  dbp: string;
  hr: string;
  rr: string;
  spo2: string;
  tempC: string;
  heightInches: string;
  weightLbs: string;
  ivSite: IvSite;
  ivGauge: IvGauge;
  ivAttempts: string;
  solidFoodHoursAgo: string;
  clearLiquidsHoursAgo: string;
  npoConfirmed: boolean;
  escortName: string;
  escortRelationship: string;
  escortPhone: string;
  escortConfirmedPresent: boolean;
  allergiesReviewed: boolean;
  belongingsSecured: boolean;
}

const DEFAULT_STATE: PreopDraftState = {
  sbp: "120",
  dbp: "80",
  hr: "72",
  rr: "16",
  spo2: "99",
  tempC: "36.8",
  heightInches: "",
  weightLbs: "",
  ivSite: "right_forearm",
  ivGauge: 20,
  ivAttempts: "1",
  solidFoodHoursAgo: "8",
  clearLiquidsHoursAgo: "3",
  npoConfirmed: true,
  escortName: "",
  escortRelationship: "spouse",
  escortPhone: "",
  escortConfirmedPresent: true,
  allergiesReviewed: true,
  belongingsSecured: true,
};

export function PreopIntakeDrawer({
  caseId,
  facilityId = "main",
  patientName,
  defaultEscort,
  open,
  onOpenChange,
  onSuccess,
}: PreopIntakeDrawerProps) {
  const storageKey = `asc-preop-draft-${caseId}`;
  const [draft, setDraft] = useState<PreopDraftState>(() => {
    if (typeof sessionStorage !== "undefined") {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          return JSON.parse(saved) as PreopDraftState;
        }
      } catch {
        // Ignore sessionStorage read errors
      }
    }
    return {
      ...DEFAULT_STATE,
      escortName: defaultEscort?.name ?? "",
      escortRelationship: defaultEscort?.relationship ?? "spouse",
      escortPhone: defaultEscort?.phone ?? "",
    };
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const submitMutation = useSubmitPreopAssessment(caseId, facilityId);

  // Persist draft to sessionStorage on state changes
  const updateDraft = (updater: (prev: PreopDraftState) => PreopDraftState) => {
    setDraft((prev) => {
      const next = updater(prev);
      if (typeof sessionStorage !== "undefined") {
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Ignore sessionStorage write errors
        }
      }
      return next;
    });
  };

  const solidsHours = Number(draft.solidFoodHoursAgo);
  const liquidsHours = Number(draft.clearLiquidsHoursAgo);
  const isNpoViolation = solidsHours < 6 || liquidsHours < 2;

  const handleSubmit = async () => {
    setLocalError(null);

    const sbp = Number(draft.sbp);
    const dbp = Number(draft.dbp);
    const hr = Number(draft.hr);
    const rr = Number(draft.rr);
    const spo2 = Number(draft.spo2);
    const tempC = Number(draft.tempC);

    if (isNaN(sbp) || isNaN(dbp) || isNaN(hr) || isNaN(rr) || isNaN(spo2) || isNaN(tempC)) {
      setLocalError("All physiological vitals must be valid numbers");
      return;
    }

    if (!draft.allergiesReviewed) {
      setLocalError("Allergies must be verbally reviewed with the patient");
      return;
    }

    if (!draft.belongingsSecured) {
      setLocalError("Patient personal belongings must be verified and secured");
      return;
    }

    const payload: PreopAssessmentInput = {
      caseId,
      facilityId,
      vitals: {
        sbp,
        dbp,
        hr,
        rr,
        spo2,
        tempC,
        ...(draft.heightInches ? { heightInches: Number(draft.heightInches) } : {}),
        ...(draft.weightLbs ? { weightLbs: Number(draft.weightLbs) } : {}),
      },
      iv: {
        site: draft.ivSite,
        gauge: draft.ivGauge,
        attempts: Number(draft.ivAttempts) || 1,
      },
      npo: {
        solidFoodHoursAgo: solidsHours,
        clearLiquidsHoursAgo: liquidsHours,
        confirmed: draft.npoConfirmed,
      },
      escort: {
        name: draft.escortName.trim() || "Unspecified",
        relationship: draft.escortRelationship.trim() || "Friend",
        phone: draft.escortPhone.trim() || "555-0100",
        confirmedPresent: draft.escortConfirmedPresent,
      },
      allergiesReviewed: true,
      belongingsSecured: true,
    };

    try {
      await submitMutation.mutateAsync(payload);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(storageKey);
      }
      toast.success("Pre-op intake assessment recorded");
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Failed to record pre-op intake";
      setLocalError(message);
      toast.error(message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto" data-testid="preop-intake-drawer">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <HeartPulse className="size-5 text-primary" aria-hidden />
            <SheetTitle>Pre-Op Bay Nursing Assessment</SheetTitle>
          </div>
          <SheetDescription>
            Record admission vitals, IV placement, NPO status, and escort verification for {patientName}.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* NPO Violation Warning Alert */}
          {isNpoViolation && (
            <div
              className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning"
              data-testid="npo-violation-alert"
            >
              <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden />
              <div>
                <p className="font-semibold">NPO Guideline Warning</p>
                <p className="mt-0.5 text-warning/90">
                  Patient reported solid food within 6 hours ({solidsHours}h) or clear liquids within 2 hours ({liquidsHours}h).
                  Prep readiness check will evaluate to failed. Alert the attending anesthesiologist.
                </p>
              </div>
            </div>
          )}

          {/* Admission Vitals */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <HeartPulse className="size-3.5" aria-hidden />
              1. Admission Vitals
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FormField id="preop-sbp" label="Systolic BP (mmHg)">
                <Input
                  id="preop-sbp"
                  value={draft.sbp}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, sbp: e.target.value }))}
                  type="number"
                  className="min-h-11"
                  data-testid="preop-vitals-sbp"
                />
              </FormField>

              <FormField id="preop-dbp" label="Diastolic BP (mmHg)">
                <Input
                  id="preop-dbp"
                  value={draft.dbp}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, dbp: e.target.value }))}
                  type="number"
                  className="min-h-11"
                  data-testid="preop-vitals-dbp"
                />
              </FormField>

              <FormField id="preop-hr" label="Heart Rate (bpm)">
                <Input
                  id="preop-hr"
                  value={draft.hr}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, hr: e.target.value }))}
                  type="number"
                  className="min-h-11"
                  data-testid="preop-vitals-hr"
                />
              </FormField>

              <FormField id="preop-rr" label="Resp Rate (min)">
                <Input
                  id="preop-rr"
                  value={draft.rr}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, rr: e.target.value }))}
                  type="number"
                  className="min-h-11"
                  data-testid="preop-vitals-rr"
                />
              </FormField>

              <FormField id="preop-spo2" label="SpO2 (%)">
                <Input
                  id="preop-spo2"
                  value={draft.spo2}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, spo2: e.target.value }))}
                  type="number"
                  className="min-h-11"
                  data-testid="preop-vitals-spo2"
                />
              </FormField>

              <FormField id="preop-temp" label="Temp (°C)">
                <Input
                  id="preop-temp"
                  value={draft.tempC}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, tempC: e.target.value }))}
                  type="number"
                  step="0.1"
                  className="min-h-11"
                  data-testid="preop-vitals-temp"
                />
              </FormField>
            </div>
          </div>

          {/* IV Access */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5" aria-hidden />
              2. Peripheral IV Placement
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="iv-site">IV Site</Label>
                <Select
                  value={draft.ivSite}
                  onValueChange={(val) => updateDraft((prev) => ({ ...prev, ivSite: val as IvSite }))}
                >
                  <SelectTrigger id="iv-site" className="min-h-11 w-full" data-testid="preop-iv-site-select">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="right_forearm">Right Forearm</SelectItem>
                    <SelectItem value="left_forearm">Left Forearm</SelectItem>
                    <SelectItem value="right_hand">Right Hand</SelectItem>
                    <SelectItem value="left_hand">Left Hand</SelectItem>
                    <SelectItem value="right_ac">Right AC</SelectItem>
                    <SelectItem value="left_ac">Left AC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="iv-gauge">Gauge</Label>
                <Select
                  value={String(draft.ivGauge)}
                  onValueChange={(val) => updateDraft((prev) => ({ ...prev, ivGauge: Number(val) as IvGauge }))}
                >
                  <SelectTrigger id="iv-gauge" className="min-h-11 w-full" data-testid="preop-iv-gauge-select">
                    <SelectValue placeholder="Gauge" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="18">18 G (Green)</SelectItem>
                    <SelectItem value="20">20 G (Pink)</SelectItem>
                    <SelectItem value="22">22 G (Blue)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <FormField id="iv-attempts" label="Attempts">
                <Input
                  id="iv-attempts"
                  value={draft.ivAttempts}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, ivAttempts: e.target.value }))}
                  type="number"
                  min="1"
                  max="5"
                  className="min-h-11"
                  data-testid="preop-iv-attempts"
                />
              </FormField>
            </div>
          </div>

          {/* NPO Evaluation */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ShieldAlert className="size-3.5" aria-hidden />
              3. NPO Status
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField id="preop-solids" label="Solid Food (Hours Ago)">
                <Input
                  id="preop-solids"
                  value={draft.solidFoodHoursAgo}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, solidFoodHoursAgo: e.target.value }))}
                  type="number"
                  min="0"
                  className="min-h-11"
                  data-testid="preop-npo-solids"
                />
              </FormField>

              <FormField id="preop-liquids" label="Clear Liquids (Hours Ago)">
                <Input
                  id="preop-liquids"
                  value={draft.clearLiquidsHoursAgo}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, clearLiquidsHoursAgo: e.target.value }))}
                  type="number"
                  min="0"
                  className="min-h-11"
                  data-testid="preop-npo-liquids"
                />
              </FormField>
            </div>
          </div>

          {/* Responsible Escort */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <UserCheck className="size-3.5" aria-hidden />
              4. Responsible Adult Escort
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField id="preop-escort-name" label="Escort Name">
                <Input
                  id="preop-escort-name"
                  value={draft.escortName}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, escortName: e.target.value }))}
                  placeholder="Escort full name"
                  className="min-h-11"
                  data-testid="preop-escort-name"
                />
              </FormField>

              <FormField id="preop-escort-rel" label="Relationship">
                <Input
                  id="preop-escort-rel"
                  value={draft.escortRelationship}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, escortRelationship: e.target.value }))}
                  placeholder="e.g. Spouse"
                  className="min-h-11"
                  data-testid="preop-escort-relationship"
                />
              </FormField>

              <FormField id="preop-escort-phone" label="Phone">
                <Input
                  id="preop-escort-phone"
                  value={draft.escortPhone}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, escortPhone: e.target.value }))}
                  placeholder="555-0100"
                  className="min-h-11"
                  data-testid="preop-escort-phone"
                />
              </FormField>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="escort-present"
                checked={draft.escortConfirmedPresent}
                onCheckedChange={(checked) => updateDraft((prev) => ({ ...prev, escortConfirmedPresent: checked === true }))}
                className="size-5"
                data-testid="preop-escort-present-checkbox"
              />
              <Label htmlFor="escort-present" className="text-xs font-normal cursor-pointer">
                Escort is verified present on premises for post-procedure transport
              </Label>
            </div>
          </div>

          {/* Safety Checklists */}
          <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
            <div className="flex items-center gap-2">
              <Checkbox
                id="allergies-reviewed"
                checked={draft.allergiesReviewed}
                onCheckedChange={(checked) => updateDraft((prev) => ({ ...prev, allergiesReviewed: checked === true }))}
                className="size-5"
                data-testid="preop-allergies-checkbox"
              />
              <Label htmlFor="allergies-reviewed" className="text-xs font-normal cursor-pointer">
                Allergies and medications verbally verified with patient
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="belongings-secured"
                checked={draft.belongingsSecured}
                onCheckedChange={(checked) => updateDraft((prev) => ({ ...prev, belongingsSecured: checked === true }))}
                className="size-5"
                data-testid="preop-belongings-checkbox"
              />
              <Label htmlFor="belongings-secured" className="text-xs font-normal cursor-pointer">
                Personal belongings, dentures, and jewelry inventoried and secured
              </Label>
            </div>
          </div>

          {/* Error Message */}
          {localError && (
            <div
              className="flex items-center gap-2 rounded-md bg-destructive/10 p-2.5 text-xs font-medium text-destructive"
              data-testid="preop-error-message"
            >
              <ShieldAlert className="size-4 shrink-0" aria-hidden />
              <span>{localError}</span>
            </div>
          )}
        </div>

        <SheetFooter className="gap-2 sm:gap-0 mt-4">
          <SheetClose render={<Button variant="outline" className="min-h-11" />}>
            Cancel
          </SheetClose>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitMutation.isPending || !draft.allergiesReviewed || !draft.belongingsSecured}
            className="min-h-11"
            data-testid="preop-submit-button"
          >
            {submitMutation.isPending && <LoaderCircle className="animate-spin size-4" aria-hidden />}
            Submit Pre-Op Assessment
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
