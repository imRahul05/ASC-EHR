// Closed capability catalog (08 §7.2). Append new capabilities, never rename.
// `stepUp` = high-risk: needs a fresh login and bypasses the identity cache.
export const CAPABILITY_CATALOG = [
  { key: "patient.read", stepUp: false, phase: "P1" },
  { key: "patient.register", stepUp: false, phase: "P1" },
  { key: "patient.merge", stepUp: false, phase: "P1" },
  { key: "patient.eligibility.check", stepUp: false, phase: "P1" },
  { key: "schedule.read", stepUp: false, phase: "P1" },
  { key: "schedule.manage", stepUp: false, phase: "P1" },
  { key: "whiteboard.read", stepUp: false, phase: "P1" },
  { key: "case.read", stepUp: false, phase: "P1" },
  { key: "case.advance", stepUp: false, phase: "P1" },
  { key: "case.cancel", stepUp: false, phase: "P1" },
  { key: "hp.document", stepUp: false, phase: "P1" },
  { key: "medhold.review", stepUp: false, phase: "P1" },
  { key: "consent.collect", stepUp: false, phase: "P1" },
  { key: "consent.witness", stepUp: false, phase: "P1" },
  { key: "timeout.participate", stepUp: false, phase: "P1" },
  { key: "procedure.document", stepUp: false, phase: "P1" },
  { key: "specimen.manage", stepUp: false, phase: "P1" },
  { key: "image.manage", stepUp: false, phase: "P1" },
  { key: "anesthesia.document", stepUp: false, phase: "P1" },
  { key: "note.draft", stepUp: false, phase: "P1" },
  { key: "note.edit", stepUp: false, phase: "P1" },
  { key: "note.sign", stepUp: true, phase: "P1" },
  { key: "note.addend", stepUp: true, phase: "P1" },
  { key: "pacu.document", stepUp: false, phase: "P1" },
  { key: "discharge.approve", stepUp: true, phase: "P1" },
  { key: "coding.review", stepUp: false, phase: "P1" },
  { key: "coding.attest", stepUp: true, phase: "P1" },
  { key: "charge.export", stepUp: false, phase: "P1" },
  { key: "pathology.reconcile", stepUp: false, phase: "P1" },
  { key: "pathology.letter.send", stepUp: false, phase: "P1" },
  { key: "referral.triage", stepUp: false, phase: "P1" },
  { key: "fax.send", stepUp: false, phase: "P1" },
  { key: "ai.generate", stepUp: false, phase: "P1" },
  { key: "admin.users", stepUp: true, phase: "P1" },
  { key: "admin.roles", stepUp: true, phase: "P1" },
  { key: "admin.facility", stepUp: true, phase: "P1" },
  { key: "audit.read", stepUp: false, phase: "P1" },
  { key: "breakglass.invoke", stepUp: true, phase: "P1" },
  { key: "portal.self.read", stepUp: false, phase: "P2" },
  { key: "portal.self.forms", stepUp: false, phase: "P2" },
] as const;

export type CapabilityEntry = (typeof CAPABILITY_CATALOG)[number];

export type Capability = CapabilityEntry["key"];

export type CapabilityPhase = CapabilityEntry["phase"];
