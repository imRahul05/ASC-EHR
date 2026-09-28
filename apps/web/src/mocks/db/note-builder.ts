import { bbpsAdequate, bbpsTotal, formatTime24, withdrawalMinutes } from "@asc/clinical-rules";
import type {
  AiProvenance,
  AnatomicSite,
  AnesthesiaRecord,
  CriticSuggestion,
  GapChip,
  NoteFinding,
  NoteSection,
  NoteSectionId,
  Patient,
  ProcedureCase,
  ProcedureEvent,
  Specimen,
} from "@asc/types";
import { ageFromDob } from "@asc/clinical-rules";

/** Synthetic AI output for the mock — built from the case's room events and specimens. */

export const SITE_LABEL: Readonly<Record<AnatomicSite, string>> = {
  cecum: "cecum",
  ascending: "ascending colon",
  hepatic_flexure: "hepatic flexure",
  transverse: "transverse colon",
  splenic_flexure: "splenic flexure",
  descending: "descending colon",
  sigmoid: "sigmoid colon",
  rectum: "rectum",
  terminal_ileum: "terminal ileum",
  esophagus: "esophagus",
  stomach: "stomach",
  duodenum: "duodenum",
};

const METHOD_LABEL: Readonly<Record<Specimen["removalMethod"], string>> = {
  cold_snare: "cold snare",
  hot_snare: "hot snare",
  cold_forceps: "cold forceps",
  biopsy: "cold biopsy forceps",
};

export const NOTE_PROVENANCE_AGENT = "procedure_note";
export const NOTE_PROMPT_VERSION = "procedure_note@2.4.1";

interface NoteInput {
  readonly procedureCase: ProcedureCase;
  readonly patient: Patient;
  readonly events: readonly ProcedureEvent[];
  readonly specimens: readonly Specimen[];
  readonly anesthesia: AnesthesiaRecord;
}

interface BuiltNote {
  readonly sections: readonly NoteSection[];
  readonly findings: readonly NoteFinding[];
  readonly gapChips: readonly GapChip[];
  readonly criticSuggestions: readonly CriticSuggestion[];
}

export function noteProvenance(generatedAt: string): AiProvenance {
  return { agent: NOTE_PROVENANCE_AGENT, model: "Tier: deep (BAA-hosted)", promptVersion: NOTE_PROMPT_VERSION, generatedAt };
}

function describeSpecimen(specimen: Specimen): string {
  const size = specimen.sizeMm ? `${specimen.sizeMm} mm ` : "";
  return `A ${size}${specimen.description.toLowerCase()} in the ${SITE_LABEL[specimen.site]}, removed with ${METHOD_LABEL[specimen.removalMethod]} (jar ${specimen.jar}).`;
}

function section(
  id: NoteSectionId,
  title: string,
  content: string,
  confidence: number,
  evidenceRefs: readonly string[] = [],
): NoteSection {
  return { id, title, content, source: "ai", confidence, evidenceRefs };
}

export function buildNote({ procedureCase, patient, events, specimens, anesthesia }: NoteInput): BuiltNote {
  const isColon = procedureCase.procedure !== "EGD";
  const age = ageFromDob(patient.dateOfBirth);
  const sexWord = patient.sex === "F" ? "woman" : patient.sex === "M" ? "man" : "patient";
  const cecum = events.find((event) => event.type === "CECUM_REACHED");
  const withdrawal = withdrawalMinutes(events);
  const propofolMg = anesthesia.doses.filter((dose) => dose.drug === "propofol").reduce((sum, dose) => sum + dose.amount, 0);
  const bbps = procedureCase.bbps;
  const eventRefs = events.map((event) => event.id);
  const specimenRefs = specimens.map((specimen) => specimen.id);

  const findings: NoteFinding[] = specimens.map((specimen) => ({
    id: `fnd_${specimen.id}`,
    site: specimen.site,
    description: specimen.description,
    sizeMm: specimen.sizeMm,
    intervention: `Removed with ${METHOD_LABEL[specimen.removalMethod]}; retrieved (jar ${specimen.jar}).`,
    specimenId: specimen.id,
  }));

  const findingsText =
    specimens.length > 0
      ? `${specimens.map(describeSpecimen).join(" ")} Resection appeared complete. Small non-bleeding internal hemorrhoids on retroflexion.`
      : "No polyps or masses. Normal-appearing mucosa throughout the examined colon. Small non-bleeding internal hemorrhoids on retroflexion.";

  const reach = isColon
    ? `advanced to the cecum, identified by the appendiceal orifice and ileocecal valve${cecum ? ` (cecum reached ${formatTime24(cecum.at)})` : ""}. The colon was examined carefully on withdrawal${withdrawal !== null ? `; withdrawal time ${withdrawal} minutes` : ""}. Retroflexion was performed in the rectum.`
    : "advanced to the second portion of the duodenum. The esophagus, stomach and duodenum were examined carefully, including retroflexion in the stomach.";

  const sections: NoteSection[] = [
    section(
      "indication",
      "Indication",
      `${procedureCase.intent[0]?.toUpperCase() ?? ""}${procedureCase.intent.slice(1)} ${procedureCase.procedureLabel.toLowerCase()} in a ${age}-year-old ${sexWord}. ${procedureCase.indication}.`,
      0.97,
    ),
    section(
      "consent",
      "Consent",
      "Risks, benefits and alternatives — including bleeding, perforation, infection, missed lesions and sedation risks — were discussed. Written consent for the procedure and anesthesia was obtained and verified during the time-out.",
      0.95,
    ),
    section(
      "sedation",
      "Sedation",
      `Monitored anesthesia care by ${anesthesia.provider.name}. Propofol ${propofolMg} mg IV total in divided doses, lidocaine 40 mg IV. ${procedureCase.asa ? `ASA class ${procedureCase.asa}. ` : ""}Oxygen via nasal cannula; no airway interventions required.`,
      0.92,
      anesthesia.doses.map((dose) => dose.id),
    ),
    section(
      "procedure",
      "Procedure",
      `After the time-out, the ${isColon ? "colonoscope was introduced through the anus and" : "gastroscope was introduced through the mouth and"} ${reach}${isColon && bbps ? ` Bowel preparation: BBPS ${bbpsTotal(bbps)}/9 (right ${bbps.right}, transverse ${bbps.transverse}, left ${bbps.left}).` : ""}`,
      bbps || !isColon ? 0.9 : 0.62,
      eventRefs,
    ),
    section("findings", "Findings", findingsText, specimens.some((s) => !s.sizeMm) ? 0.58 : 0.91, specimenRefs),
    section(
      "impression",
      "Impression",
      specimens.length > 0
        ? `${specimens.length} polyp${specimens.length > 1 ? "s" : ""} removed (${specimens.map((s) => SITE_LABEL[s.site]).join(", ")}). Internal hemorrhoids.`
        : "Normal colonoscopy. Internal hemorrhoids.",
      0.9,
      specimenRefs,
    ),
    section(
      "recommendations",
      "Recommendations",
      `${specimens.length > 0 ? "Await pathology; surveillance interval will be set from histology (USMSTF 2020). Avoid NSAIDs for 7 days. " : "Repeat colonoscopy in 10 years for screening. "}Resume regular diet. ${patient.medications.some((m) => m.medClass === "anticoagulant") ? "Resume anticoagulation in 48 hours if no bleeding. " : ""}Written discharge instructions given to patient and escort.`,
      0.88,
    ),
    section(
      "quality",
      "Quality measures",
      isColon
        ? `Cecal intubation: ${cecum ? "yes" : "not documented"}. Withdrawal time: ${withdrawal ?? "—"} min (benchmark ≥ 6). Prep: ${bbps ? `${bbpsAdequate(bbps) ? "adequate" : "inadequate"} (BBPS ${bbpsTotal(bbps)})` : "not documented"}.`
        : "Photo-documentation of landmarks obtained.",
      0.93,
      eventRefs,
    ),
  ];

  const gapChips: GapChip[] = [
    ...specimens
      .filter((specimen) => !specimen.sizeMm)
      .map((specimen) => ({
        id: `gap_size_${specimen.id}`,
        sectionId: "findings" as const,
        message: `Size of the polyp in jar ${specimen.jar} (${SITE_LABEL[specimen.site]}) is not documented.`,
        blocking: true,
        resolved: false,
      })),
    ...(isColon && !bbps
      ? [{ id: "gap_bbps", sectionId: "procedure" as const, message: "Bowel prep quality (BBPS) is not documented.", blocking: true, resolved: false }]
      : []),
    ...(isColon
      ? [
          {
            id: "gap_ileum",
            sectionId: "procedure" as const,
            message: "State whether the terminal ileum was intubated.",
            blocking: false,
            resolved: false,
          },
        ]
      : []),
  ];

  const criticSuggestions: CriticSuggestion[] =
    specimens.length > 0
      ? [
          {
            id: "crit_resection",
            sectionId: "impression",
            message: "Impression omits resection completeness and retrieval — both drive surveillance.",
            suggestedText: `${specimens.length} polyp${specimens.length > 1 ? "s" : ""} completely resected and retrieved (${specimens.map((s) => SITE_LABEL[s.site]).join(", ")}). Internal hemorrhoids.`,
            status: "open",
          },
        ]
      : [];

  return { sections, findings, gapChips, criticSuggestions };
}
