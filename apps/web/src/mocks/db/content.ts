import type { DischargeInstructions, Patient, PreVisitBrief, PrepItem, ProcedureCase, Specimen } from "@asc/types";
import { addMinutes } from "./util";

/** Synthetic AI drafts (pre-visit brief, discharge instructions) and the patient prep checklist. */

const DAY_MIN = 24 * 60;

export function buildPreVisitBrief(procedureCase: ProcedureCase, patient: Patient, generatedAt: string): PreVisitBrief {
  const holds = patient.medications.filter((med) => med.holdRule);
  const flags = [
    ...holds.map((med) => `${med.name}: ${med.holdRule?.instruction ?? ""}`),
    ...patient.allergies.filter((a) => a.severity === "severe").map((a) => `Severe allergy: ${a.substance} (${a.reaction})`),
    ...(patient.medications.some((m) => m.medClass === "glp1") ? ["GLP-1 agonist — confirm last dose; aspiration risk"] : []),
  ];
  return {
    summary: `${procedureCase.intent[0]?.toUpperCase() ?? ""}${procedureCase.intent.slice(1)} ${procedureCase.procedureLabel.toLowerCase()} — ${procedureCase.indication}. ${patient.medications.length} active medication(s), ${patient.allergies.length} allergy record(s). No prior sedation complications on file.`,
    flags,
    provenance: { agent: "pre_visit_brief", model: "Tier: balanced (BAA-hosted)", promptVersion: "pre_visit_brief@1.1.0", generatedAt },
  };
}

export function buildDischargeInstructions(
  procedureCase: ProcedureCase,
  patient: Patient,
  specimens: readonly Specimen[],
  generatedAt: string,
): DischargeInstructions {
  const anticoagulant = patient.medications.find((m) => m.medClass === "anticoagulant" || m.medClass === "antiplatelet");
  return {
    caseId: procedureCase.id,
    status: "draft",
    language: patient.preferredLanguage,
    readingLevel: "Grade 6",
    sections: [
      {
        title: "What was done",
        body:
          specimens.length > 0
            ? `You had a ${procedureCase.procedureLabel.toLowerCase()}. Your doctor removed ${specimens.length} small growth${specimens.length > 1 ? "s" : ""} (polyps). They were sent to the lab.`
            : `You had a ${procedureCase.procedureLabel.toLowerCase()}. Your doctor did not find anything that needed to be removed.`,
      },
      {
        title: "For the rest of today",
        body: "You had sedation. Do not drive, drink alcohol, or sign important papers until tomorrow. An adult should stay with you tonight.",
      },
      { title: "Eating and drinking", body: "Start with light foods and plenty of fluids. You can go back to your normal diet when you feel ready." },
      {
        title: "Medicines",
        body: anticoagulant
          ? `Restart ${anticoagulant.name} in 2 days unless your doctor tells you otherwise. Avoid ibuprofen and naproxen for 7 days.`
          : "Restart your usual medicines today. Avoid ibuprofen and naproxen for 7 days if polyps were removed.",
      },
      {
        title: "Call us right away if",
        body: "You have more than a few spoonfuls of blood from your bottom, strong belly pain, fever over 100.4 °F (38 °C), or vomiting. Call the center or 911 in an emergency.",
      },
      {
        title: "Results",
        body:
          specimens.length > 0
            ? "Lab results are usually ready in 5–7 days. We will send them to your patient portal with your next colonoscopy date."
            : "No lab results are pending.",
      },
    ],
    provenance: {
      agent: "discharge_instructions",
      model: "Tier: fast (BAA-hosted)",
      promptVersion: "discharge_instructions@1.2.0",
      generatedAt,
    },
  };
}

export function buildPrepChecklist(procedureCase: ProcedureCase, patient: Patient, doneBeforeIso: string): PrepItem[] {
  const start = procedureCase.scheduledStart;
  const items: readonly (readonly [id: string, label: string, detail: string, offsetMin: number])[] = [
    ["prep_low_fiber", "Low-fiber diet", "Avoid seeds, nuts, raw vegetables and whole grains.", -3 * DAY_MIN],
    ...patient.medications
      .filter((med) => med.holdRule)
      .map(
        (med) =>
          [`prep_hold_${med.id}`, `Stop ${med.name}`, med.holdRule?.instruction ?? "", -(med.holdRule?.daysBefore ?? 1) * DAY_MIN] as const,
      ),
    ["prep_escort", "Arrange your escort", "An adult must drive you home and stay with you.", -2 * DAY_MIN],
    ["prep_clear_liquids", "Clear liquids only", "Water, clear broth, apple juice, plain gelatin — nothing red or purple.", -DAY_MIN],
    ["prep_dose_1", "First prep dose", "Drink the first half of your bowel prep at 6 PM.", -DAY_MIN + 18 * 60 - 7 * 60],
    ["prep_dose_2", "Second prep dose", "Drink the second half 5 hours before your arrival time.", -5 * 60],
    ["prep_npo", "Nothing by mouth", "Stop all liquids 2 hours before arrival.", -2 * 60],
  ];
  return items.map(([id, label, detail, offsetMin]) => {
    const dueAt = addMinutes(start, offsetMin);
    return { id, label, detail, dueAt, done: Date.parse(dueAt) < Date.parse(doneBeforeIso) };
  });
}
