import type { ChargeLine, CodingSuggestion, EvidenceRef, Patient, ProcedureCase, Specimen } from "@asc/types";

/** Synthetic coding-agent output (rules first, AI for ambiguity — docs/product/04 §4.9). */

interface CodeSeed {
  readonly code: string;
  readonly system: CodingSuggestion["system"];
  readonly description: string;
  readonly confidence: number;
  readonly rationale: string;
  readonly line: CodingSuggestion["line"];
  readonly evidence: readonly EvidenceRef[];
}

/** Demo fee schedule (cents) for the charge export. */
const FEE_CENTS: Readonly<Record<string, number>> = {
  "45378": 68_500,
  "45380": 82_000,
  "45385": 96_500,
  G0121: 64_000,
  "43235": 61_000,
  "43239": 74_500,
  "00811": 42_000,
  "00812": 38_000,
  "00731": 36_500,
};

const noteRef = (id: string, label: string): EvidenceRef => ({ kind: "note_section", id, label });

export function buildCodingSuggestions(procedureCase: ProcedureCase, patient: Patient, specimens: readonly Specimen[]): CodingSuggestion[] {
  const medicare = patient.coverage?.payer === "Medicare";
  const screening = procedureCase.intent === "screening";
  const specimenRefs: EvidenceRef[] = specimens.map((s) => ({ kind: "specimen", id: s.id, label: `Jar ${s.jar}` }));
  const snared = specimens.filter((s) => s.removalMethod.endsWith("snare"));
  const biopsied = specimens.filter((s) => s.removalMethod === "cold_forceps" || s.removalMethod === "biopsy");

  const seeds: CodeSeed[] =
    procedureCase.procedure === "EGD"
      ? [
          {
            code: biopsied.length > 0 ? "43239" : "43235",
            system: "CPT",
            description: biopsied.length > 0 ? "EGD with biopsy, single or multiple" : "EGD, diagnostic",
            confidence: 0.94,
            rationale: "Upper endoscopy to the duodenum documented.",
            line: "professional",
            evidence: [noteRef("procedure", "Procedure"), ...specimenRefs],
          },
          { code: "K21.9", system: "ICD10", description: "GERD without esophagitis", confidence: 0.72, rationale: "Indication text.", line: "professional", evidence: [noteRef("indication", "Indication")] },
          { code: "00731", system: "CPT", description: "Anesthesia for upper GI endoscopic procedures", confidence: 0.9, rationale: "MAC documented.", line: "anesthesia", evidence: [noteRef("sedation", "Sedation")] },
        ]
      : [
          snared.length > 0
            ? {
                code: "45385",
                system: "CPT",
                description: "Colonoscopy with removal of lesion(s) by snare technique",
                confidence: 0.93,
                rationale: `${snared.length} polyp(s) removed by snare.`,
                line: "professional",
                evidence: [noteRef("findings", "Findings"), ...specimenRefs],
              }
            : biopsied.length > 0
              ? {
                  code: "45380",
                  system: "CPT",
                  description: "Colonoscopy with biopsy, single or multiple",
                  confidence: 0.9,
                  rationale: "Cold forceps removal documented.",
                  line: "professional",
                  evidence: [noteRef("findings", "Findings"), ...specimenRefs],
                }
              : {
                  code: screening && medicare ? "G0121" : "45378",
                  system: "CPT",
                  description: screening && medicare ? "Colorectal cancer screening; colonoscopy, not high risk" : "Colonoscopy, diagnostic",
                  confidence: 0.91,
                  rationale: "No intervention performed.",
                  line: "professional",
                  evidence: [noteRef("procedure", "Procedure")],
                },
          ...(screening && specimens.length > 0
            ? [
                {
                  code: medicare ? "PT" : "33",
                  system: "MOD" as const,
                  description: medicare ? "Colorectal screening converted to diagnostic/therapeutic" : "Preventive service",
                  confidence: 0.71,
                  rationale: "Screening intent with polypectomy — payer-specific modifier.",
                  line: "professional" as const,
                  evidence: [noteRef("indication", "Indication"), noteRef("findings", "Findings")],
                },
              ]
            : []),
          screening
            ? { code: "Z12.11", system: "ICD10", description: "Encounter for screening for malignant neoplasm of colon", confidence: 0.96, rationale: "Screening intent.", line: "professional", evidence: [noteRef("indication", "Indication")] }
            : procedureCase.intent === "surveillance"
              ? { code: "Z86.010", system: "ICD10", description: "Personal history of colonic polyps", confidence: 0.92, rationale: "Surveillance intent.", line: "professional", evidence: [noteRef("indication", "Indication")] }
              : { code: "K92.1", system: "ICD10", description: "Melena / GI bleeding, unspecified", confidence: 0.64, rationale: "Diagnostic indication; confirm with referral.", line: "professional", evidence: [noteRef("indication", "Indication")] },
          ...(specimens.length > 0
            ? [
                {
                  code: "K63.5",
                  system: "ICD10" as const,
                  description: "Polyp of colon",
                  confidence: 0.84,
                  rationale: "Polyps removed; refine to D12.x when pathology returns.",
                  line: "professional" as const,
                  evidence: specimenRefs,
                },
              ]
            : []),
          { code: "K64.8", system: "ICD10", description: "Other hemorrhoids", confidence: 0.58, rationale: "Incidental internal hemorrhoids on retroflexion.", line: "professional", evidence: [noteRef("findings", "Findings")] },
          {
            code: screening ? "00812" : "00811",
            system: "CPT",
            description: screening ? "Anesthesia for lower GI endoscopy; screening colonoscopy" : "Anesthesia for lower GI endoscopic procedures",
            confidence: 0.9,
            rationale: "Monitored anesthesia care documented.",
            line: "anesthesia",
            evidence: [noteRef("sedation", "Sedation")],
          },
        ];

  return seeds.map((seed, index) => ({
    id: `cod_${procedureCase.id}_${index}`,
    caseId: procedureCase.id,
    code: seed.code,
    system: seed.system,
    description: seed.description,
    confidence: seed.confidence,
    evidenceRefs: seed.evidence,
    rationale: seed.rationale,
    line: seed.line,
    status: "suggested",
  }));
}

/** Charge lines from accepted/edited CPT codes (modifiers attach to professional lines). */
export function chargeLinesFrom(suggestions: readonly CodingSuggestion[]): ChargeLine[] {
  const kept = suggestions.filter((s) => s.status === "accepted" || s.status === "edited");
  const modifiers = kept.filter((s) => s.system === "MOD").map((s) => s.code);
  const diagnoses = kept.filter((s) => s.system === "ICD10").map((s) => s.code);
  return kept
    .filter((s) => s.system === "CPT")
    .map((s) => ({
      code: s.code,
      modifiers: s.line === "professional" ? modifiers : [],
      diagnosisPointers: diagnoses.slice(0, 4),
      units: s.line === "anesthesia" ? 4 : 1,
      chargeCents: FEE_CENTS[s.code] ?? 50_000,
      line: s.line,
    }));
}
