/**
 * Display labels for procedure-room and anesthesia values (one source for room, note, pathology and coding screens).
 */
import type {
  AirwayDevice,
  AirwayEventType,
  AnatomicSite,
  AnesthesiaDrug,
  AnesthesiaTechnique,
  ProcedureEventType,
  RemovalMethod,
  TimeOutChecklist,
} from "@asc/types";

export const ANATOMIC_SITE_LABEL: Readonly<Record<AnatomicSite, string>> = {
  cecum: "Cecum",
  ascending: "Ascending colon",
  hepatic_flexure: "Hepatic flexure",
  transverse: "Transverse colon",
  splenic_flexure: "Splenic flexure",
  descending: "Descending colon",
  sigmoid: "Sigmoid colon",
  rectum: "Rectum",
  terminal_ileum: "Terminal ileum",
  esophagus: "Esophagus",
  stomach: "Stomach",
  duodenum: "Duodenum",
};

/** Colon segments in scope-withdrawal order (cecum → rectum). */
export const COLON_SITES: readonly AnatomicSite[] = [
  "terminal_ileum",
  "cecum",
  "ascending",
  "hepatic_flexure",
  "transverse",
  "splenic_flexure",
  "descending",
  "sigmoid",
  "rectum",
];

export const UPPER_GI_SITES: readonly AnatomicSite[] = ["esophagus", "stomach", "duodenum"];

export const REMOVAL_METHOD_LABEL: Readonly<Record<RemovalMethod, string>> = {
  cold_snare: "Cold snare",
  hot_snare: "Hot snare",
  cold_forceps: "Cold forceps",
  biopsy: "Biopsy",
};

export const PROCEDURE_EVENT_LABEL: Readonly<Record<ProcedureEventType, string>> = {
  SEDATION_START: "Sedation start",
  SCOPE_IN: "Scope in",
  CECUM_REACHED: "Cecum reached",
  TERMINAL_ILEUM: "Terminal ileum",
  WITHDRAWAL_START: "Withdrawal start",
  POLYP_FOUND: "Polyp found",
  SCOPE_OUT: "Scope out",
  SEDATION_END: "Sedation end",
  COMPLICATION: "Complication",
};

/** Events that can be recorded more than once per case (the API rejects duplicates of the rest). */
export const REPEATABLE_PROCEDURE_EVENTS: readonly ProcedureEventType[] = ["POLYP_FOUND", "COMPLICATION"];

export const TIME_OUT_ITEM_LABEL: Readonly<Record<keyof TimeOutChecklist, string>> = {
  patientIdentity: "Patient identity (2 identifiers)",
  procedureConfirmed: "Procedure & site confirmed",
  consentVerified: "Consent signed & verified",
  allergiesReviewed: "Allergies reviewed",
  anticoagulationReviewed: "Anticoagulation / holds reviewed",
  equipmentReady: "Equipment & scope ready",
};

export const ANESTHESIA_DRUG_LABEL: Readonly<Record<AnesthesiaDrug, string>> = {
  propofol: "Propofol",
  midazolam: "Midazolam",
  fentanyl: "Fentanyl",
  lidocaine: "Lidocaine",
  glycopyrrolate: "Glycopyrrolate",
  ephedrine: "Ephedrine",
  phenylephrine: "Phenylephrine",
  ondansetron: "Ondansetron",
};

export const ANESTHESIA_TECHNIQUE_LABEL: Readonly<Record<AnesthesiaTechnique, string>> = {
  MAC: "Monitored anesthesia care",
  moderate: "Moderate sedation",
  general: "General anesthesia",
};

export const AIRWAY_DEVICE_LABEL: Readonly<Record<AirwayDevice, string>> = {
  nasal_cannula: "Nasal cannula",
  face_mask: "Face mask",
  high_flow_nasal: "High-flow nasal",
  lma: "LMA",
  ett: "Endotracheal tube",
};

export const AIRWAY_EVENT_LABEL: Readonly<Record<AirwayEventType, string>> = {
  jaw_thrust: "Jaw thrust",
  chin_lift: "Chin lift",
  o2_increased: "O₂ increased",
  desaturation: "Desaturation",
  airway_inserted: "Airway inserted",
  apnea: "Apnea",
};
