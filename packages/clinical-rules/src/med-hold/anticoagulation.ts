import type { Medication } from "@asc/types";

export type ProcedureBleedingRisk = "low" | "high";
export type AnticoagulantDrugClass = "doac" | "warfarin" | "p2y12" | "aspirin" | "lmwh" | "other";

export interface AnticoagulantHoldRecommendation {
  readonly medicationId: string;
  readonly medicationName: string;
  readonly drugClass: AnticoagulantDrugClass;
  readonly bleedingRisk: ProcedureBleedingRisk;
  readonly recommendedHoldHours: number;
  readonly recommendationText: string;
  readonly ruleVersion: "ASGE-2022-v1";
  readonly targetInr?: number;
  readonly continueAllowed: boolean;
}

export interface AnticoagulationAssessmentItem {
  readonly medicationId: string;
  readonly prescriberInstructionDate?: string | null;
  readonly prescriberInstruction?: string | null;
  readonly patientConfirmedHeld?: boolean | null;
  readonly lastDoseTakenAt?: string | null;
}

export interface EvaluateAnticoagulationParams {
  readonly medications: readonly Medication[];
  readonly procedureBleedingRisk: ProcedureBleedingRisk;
  readonly assessments?: readonly AnticoagulationAssessmentItem[];
}

export interface AnticoagulationEvaluationResult {
  readonly status: "satisfied" | "pending" | "failed";
  readonly hasAnticoagulants: boolean;
  readonly recommendations: readonly AnticoagulantHoldRecommendation[];
  readonly missingPrescriberInstructions: readonly string[];
  readonly unconfirmedPatientHolds: readonly string[];
  readonly message: string;
}

const DOAC_REGEX = /apixaban|eliquis|rivaroxaban|xarelto|dabigatran|pradaxa|edoxaban|savaysa/i;
const WARFARIN_REGEX = /warfarin|coumadin|jantoven/i;
const P2Y12_REGEX = /clopidogrel|plavix|prasugrel|effient|ticagrelor|brilinta/i;
const ASPIRIN_REGEX = /aspirin|asa|ecotrin/i;
const LMWH_REGEX = /enoxaparin|lovenox|heparin|dalteparin/i;

export function classifyAnticoagulant(name: string): AnticoagulantDrugClass | null {
  if (DOAC_REGEX.test(name)) return "doac";
  if (WARFARIN_REGEX.test(name)) return "warfarin";
  if (P2Y12_REGEX.test(name)) return "p2y12";
  if (ASPIRIN_REGEX.test(name)) return "aspirin";
  if (LMWH_REGEX.test(name)) return "lmwh";
  return null;
}

export function isAnticoagulantOrAntiplatelet(med: Medication): boolean {
  if (med.medClass === "anticoagulant" || med.medClass === "antiplatelet") return true;
  return classifyAnticoagulant(med.name) !== null;
}

/**
 * Builds the ASGE 2022 clinical hold recommendation for a specific medication.
 */
export function getAsgeRecommendation(
  med: Medication,
  risk: ProcedureBleedingRisk,
): AnticoagulantHoldRecommendation {
  const drugClass = classifyAnticoagulant(med.name) ?? "other";

  if (risk === "low") {
    return {
      medicationId: med.id,
      medicationName: med.name,
      drugClass,
      bleedingRisk: "low",
      recommendedHoldHours: 0,
      recommendationText:
        "Low bleeding risk procedure. Continue medication as scheduled per ASGE 2022 guidelines.",
      ruleVersion: "ASGE-2022-v1",
      continueAllowed: true,
    };
  }

  // High bleeding risk
  switch (drugClass) {
    case "doac":
      return {
        medicationId: med.id,
        medicationName: med.name,
        drugClass: "doac",
        bleedingRisk: "high",
        recommendedHoldHours: 48,
        recommendationText:
          "High bleeding risk procedure. Hold DOAC for at least 48 hours prior to procedure (ASGE 2022).",
        ruleVersion: "ASGE-2022-v1",
        continueAllowed: false,
      };

    case "warfarin":
      return {
        medicationId: med.id,
        medicationName: med.name,
        drugClass: "warfarin",
        bleedingRisk: "high",
        recommendedHoldHours: 120, // 5 days
        targetInr: 1.5,
        recommendationText:
          "High bleeding risk procedure. Hold Warfarin for 5 days prior to procedure; verify INR < 1.5 before intervention (ASGE 2022).",
        ruleVersion: "ASGE-2022-v1",
        continueAllowed: false,
      };

    case "p2y12":
      return {
        medicationId: med.id,
        medicationName: med.name,
        drugClass: "p2y12",
        bleedingRisk: "high",
        recommendedHoldHours: 120, // 5 to 7 days (default 5 days = 120h)
        recommendationText:
          "High bleeding risk procedure. Hold Clopidogrel/P2Y12 inhibitor for 5–7 days prior to procedure (ASGE 2022).",
        ruleVersion: "ASGE-2022-v1",
        continueAllowed: false,
      };

    case "aspirin":
      return {
        medicationId: med.id,
        medicationName: med.name,
        drugClass: "aspirin",
        bleedingRisk: "high",
        recommendedHoldHours: 0,
        recommendationText:
          "Aspirin monotherapy may be continued for standard endoscopy unless explicit high-risk override (ASGE 2022).",
        ruleVersion: "ASGE-2022-v1",
        continueAllowed: true,
      };

    case "lmwh":
      return {
        medicationId: med.id,
        medicationName: med.name,
        drugClass: "lmwh",
        bleedingRisk: "high",
        recommendedHoldHours: 24,
        recommendationText:
          "High bleeding risk procedure. Hold therapeutic LMWH for 24 hours prior to procedure (ASGE 2022).",
        ruleVersion: "ASGE-2022-v1",
        continueAllowed: false,
      };

    default:
      return {
        medicationId: med.id,
        medicationName: med.name,
        drugClass: "other",
        bleedingRisk: "high",
        recommendedHoldHours: 48,
        recommendationText:
          "High bleeding risk procedure. Hold medication per specialist instruction (ASGE 2022).",
        ruleVersion: "ASGE-2022-v1",
        continueAllowed: false,
      };
  }
}

/**
 * Pure ASGE 2022 anticoagulation hold rule engine.
 * Maps patient medications and procedure bleeding risk to recommended hold windows,
 * requiring explicit prescriber instruction date and patient day-of hold confirmation.
 */
export function evaluateAnticoagulationHold(
  params: EvaluateAnticoagulationParams,
): AnticoagulationEvaluationResult {
  const { medications, procedureBleedingRisk, assessments = [] } = params;

  const assessmentMap = new Map<string, AnticoagulationAssessmentItem>();
  for (const item of assessments) {
    assessmentMap.set(item.medicationId, item);
  }

  const targetMeds = medications.filter(isAnticoagulantOrAntiplatelet);

  if (targetMeds.length === 0) {
    return {
      status: "satisfied",
      hasAnticoagulants: false,
      recommendations: [],
      missingPrescriberInstructions: [],
      unconfirmedPatientHolds: [],
      message: "No anticoagulants or antiplatelet agents active.",
    };
  }

  const recommendations: AnticoagulantHoldRecommendation[] = [];
  const missingPrescriberInstructions: string[] = [];
  const unconfirmedPatientHolds: string[] = [];
  let hasFailed = false;

  for (const med of targetMeds) {
    const rec = getAsgeRecommendation(med, procedureBleedingRisk);
    recommendations.push(rec);

    // If hold is not required (e.g. low-risk or aspirin continuation), no hold requirement
    if (rec.continueAllowed) {
      continue;
    }

    const assessment = assessmentMap.get(med.id);
    const hasPrescriberInstruction = Boolean(
      assessment?.prescriberInstructionDate ||
        (med as { prescriberInstructionDate?: string }).prescriberInstructionDate,
    );

    if (!hasPrescriberInstruction) {
      missingPrescriberInstructions.push(med.id);
      continue;
    }

    const patientHeld =
      assessment?.patientConfirmedHeld !== undefined
        ? assessment.patientConfirmedHeld
        : (med as { patientConfirmedHeld?: boolean | null }).patientConfirmedHeld !== undefined
          ? (med as { patientConfirmedHeld?: boolean | null }).patientConfirmedHeld
          : med.holdStatus === "confirmed"
            ? true
            : med.holdStatus === "not_held"
              ? false
              : null;

    if (patientHeld === false) {
      hasFailed = true;
    } else if (patientHeld !== true) {
      unconfirmedPatientHolds.push(med.id);
    }
  }

  if (hasFailed) {
    return {
      status: "failed",
      hasAnticoagulants: true,
      recommendations,
      missingPrescriberInstructions,
      unconfirmedPatientHolds,
      message:
        "Patient took medication during recommended hold window. Anesthesia and attending review required.",
    };
  }

  if (missingPrescriberInstructions.length > 0) {
    return {
      status: "pending",
      hasAnticoagulants: true,
      recommendations,
      missingPrescriberInstructions,
      unconfirmedPatientHolds,
      message: `Prescriber hold instructions missing for ${missingPrescriberInstructions.length} medication(s).`,
    };
  }

  if (unconfirmedPatientHolds.length > 0) {
    return {
      status: "pending",
      hasAnticoagulants: true,
      recommendations,
      missingPrescriberInstructions,
      unconfirmedPatientHolds,
      message: `Patient day-of hold unconfirmed for ${unconfirmedPatientHolds.length} medication(s).`,
    };
  }

  return {
    status: "satisfied",
    hasAnticoagulants: true,
    recommendations,
    missingPrescriberInstructions: [],
    unconfirmedPatientHolds: [],
    message: "Anticoagulation and antiplatelet holds verified and confirmed.",
  };
}
