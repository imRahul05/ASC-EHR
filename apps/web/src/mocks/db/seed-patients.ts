import { holdRuleFor } from "@asc/clinical-rules";
import type { Allergy, Coverage, Escort, Medication, MedicationClass, Patient, Sex } from "@asc/types";

/** Synthetic demo patients — invented names, numbers and addresses (no real PHI). */

interface MedSeed {
  readonly name: string;
  readonly dose: string;
  readonly frequency: string;
  readonly medClass: MedicationClass;
}

interface PatientSeed {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: string;
  readonly sex: Sex;
  readonly payer: readonly [payer: string, plan: string];
  readonly escort: readonly [name: string, relationship: string];
  readonly allergies?: readonly (readonly [substance: string, reaction: string, severity: Allergy["severity"]])[];
  readonly meds?: readonly MedSeed[];
  readonly city: string;
}

const MED = {
  apixaban: { name: "Apixaban", dose: "5 mg", frequency: "twice daily", medClass: "anticoagulant" },
  warfarin: { name: "Warfarin", dose: "5 mg", frequency: "daily", medClass: "anticoagulant" },
  clopidogrel: { name: "Clopidogrel", dose: "75 mg", frequency: "daily", medClass: "antiplatelet" },
  semaglutide: { name: "Semaglutide", dose: "1 mg", frequency: "weekly (SC)", medClass: "glp1" },
  metformin: { name: "Metformin", dose: "1000 mg", frequency: "twice daily", medClass: "oral_hypoglycemic" },
  ferrous: { name: "Ferrous sulfate", dose: "325 mg", frequency: "daily", medClass: "iron" },
  lisinopril: { name: "Lisinopril", dose: "10 mg", frequency: "daily", medClass: "other" },
  atorvastatin: { name: "Atorvastatin", dose: "40 mg", frequency: "nightly", medClass: "other" },
  omeprazole: { name: "Omeprazole", dose: "20 mg", frequency: "daily", medClass: "other" },
  levothyroxine: { name: "Levothyroxine", dose: "75 mcg", frequency: "daily", medClass: "other" },
} as const satisfies Record<string, MedSeed>;

const SEEDS: readonly PatientSeed[] = [
  { id: "pat_101", firstName: "Thomas", lastName: "Reed", dateOfBirth: "1961-03-14", sex: "M", payer: ["Medicare", "Part B"], escort: ["Joan Reed", "Spouse"], meds: [MED.lisinopril, MED.atorvastatin], city: "Oakview" },
  { id: "pat_102", firstName: "Angela", lastName: "Brooks", dateOfBirth: "1972-08-02", sex: "F", payer: ["Aetna", "Choice POS II"], escort: ["Marcus Brooks", "Brother"], allergies: [["Sulfa drugs", "Rash", "moderate"]], meds: [MED.levothyroxine], city: "Riverside" },
  { id: "pat_103", firstName: "Daniel", lastName: "Ortiz", dateOfBirth: "1966-11-23", sex: "M", payer: ["BlueCross BlueShield", "PPO Blue"], escort: ["Lucia Ortiz", "Spouse"], meds: [MED.metformin, MED.lisinopril], city: "Maple Grove" },
  { id: "pat_104", firstName: "Priya", lastName: "Raman", dateOfBirth: "1975-05-09", sex: "F", payer: ["UnitedHealthcare", "Choice Plus"], escort: ["Arjun Raman", "Spouse"], meds: [MED.omeprazole], city: "Oakview" },
  { id: "pat_105", firstName: "Robert", lastName: "Miller", dateOfBirth: "1968-04-12", sex: "M", payer: ["Cigna", "Open Access Plus"], escort: ["Linda Miller", "Spouse"], meds: [MED.atorvastatin], city: "Lakeside" },
  { id: "pat_106", firstName: "Grace", lastName: "Holloway", dateOfBirth: "1958-01-30", sex: "F", payer: ["Medicare", "Part B"], escort: ["Ellen Holloway", "Daughter"], allergies: [["Latex", "Hives", "moderate"]], meds: [MED.clopidogrel, MED.atorvastatin], city: "Northgate" },
  { id: "pat_107", firstName: "Walter", lastName: "Kim", dateOfBirth: "1955-09-17", sex: "M", payer: ["Humana", "Medicare Advantage PPO"], escort: ["Grace Kim", "Spouse"], allergies: [["Penicillin", "Anaphylaxis", "severe"]], meds: [MED.apixaban, MED.metformin, MED.lisinopril], city: "Harbor City" },
  { id: "pat_108", firstName: "Denise", lastName: "Carter", dateOfBirth: "1970-12-05", sex: "F", payer: ["Aetna", "Open Access"], escort: ["Paul Carter", "Spouse"], meds: [MED.semaglutide], city: "Riverside" },
  { id: "pat_109", firstName: "Marcus", lastName: "Bell", dateOfBirth: "1979-06-21", sex: "M", payer: ["UnitedHealthcare", "Navigate HMO"], escort: ["Tina Bell", "Sister"], city: "Maple Grove" },
  { id: "pat_110", firstName: "Helen", lastName: "Novak", dateOfBirth: "1963-02-11", sex: "F", payer: ["BlueCross BlueShield", "Blue Advantage"], escort: ["Peter Novak", "Son"], meds: [MED.ferrous], city: "Lakeside" },
  { id: "pat_111", firstName: "Victor", lastName: "Hughes", dateOfBirth: "1969-07-28", sex: "M", payer: ["Cigna", "LocalPlus"], escort: ["Dana Hughes", "Spouse"], city: "Oakview" },
  { id: "pat_112", firstName: "Sofia", lastName: "Alvarez", dateOfBirth: "1981-10-03", sex: "F", payer: ["Aetna", "Choice POS II"], escort: ["Miguel Alvarez", "Spouse"], allergies: [["Codeine", "Nausea", "mild"]], meds: [MED.omeprazole], city: "Harbor City" },
  { id: "pat_113", firstName: "Leonard", lastName: "Price", dateOfBirth: "1957-04-26", sex: "M", payer: ["Medicare", "Part B"], escort: ["Ruth Price", "Spouse"], meds: [MED.warfarin, MED.atorvastatin], city: "Northgate" },
  { id: "pat_114", firstName: "Janet", lastName: "Foster", dateOfBirth: "1964-08-19", sex: "F", payer: ["Humana", "Gold Plus HMO"], escort: ["Carl Foster", "Spouse"], city: "Riverside" },
  { id: "pat_115", firstName: "Harold", lastName: "Singh", dateOfBirth: "1960-12-12", sex: "M", payer: ["BlueCross BlueShield", "PPO Blue"], escort: ["Amrit Singh", "Son"], meds: [MED.lisinopril], city: "Maple Grove" },
  { id: "pat_116", firstName: "Margaret", lastName: "Olsen", dateOfBirth: "1959-06-07", sex: "F", payer: ["Medicare", "Part B"], escort: ["Erik Olsen", "Spouse"], allergies: [["Iodinated contrast", "Hives", "moderate"]], city: "Lakeside" },
];

function coverageOf(seed: PatientSeed, index: number): Coverage {
  const [payer, planName] = seed.payer;
  return {
    id: `cov_${seed.id.slice(4)}`,
    payer,
    planName,
    memberId: `${payer.slice(0, 3).toUpperCase()}${String(482_190_300 + index * 7_919).padStart(9, "0")}`,
    groupNumber: payer === "Medicare" ? undefined : `GRP-${3100 + index * 13}`,
    subscriberRelationship: "self",
    eligibility: null,
  };
}

function escortOf(seed: PatientSeed, index: number): Escort {
  const [name, relationship] = seed.escort;
  return { name, relationship, phone: `(555) 01${String(10 + index).padStart(2, "0")}-${String(2000 + index * 37).slice(-4)}`, confirmed: false, present: false };
}

function medicationOf(med: MedSeed, patientId: string, index: number): Medication {
  const holdRule = holdRuleFor(med.medClass);
  return {
    id: `med_${patientId.slice(4)}_${index}`,
    ...med,
    holdRule,
    holdStatus: holdRule ? "pending" : "not_required",
  };
}

/** Fresh copies of the demo patients (hold/eligibility/escort status is set per case phase in seed-cases). */
export function seedPatients(createdAt: string): Patient[] {
  return SEEDS.map((seed, index) => ({
    id: seed.id,
    mrn: `MRN-${String(204_310 + index * 17)}`,
    firstName: seed.firstName,
    lastName: seed.lastName,
    dateOfBirth: seed.dateOfBirth,
    sex: seed.sex,
    phone: `(555) 01${String(40 + index).padStart(2, "0")}-${String(3100 + index * 53).slice(-4)}`,
    email: `${seed.firstName.toLowerCase()}.${seed.lastName.toLowerCase()}@example.test`,
    address: { line: `${120 + index * 11} Demo Street`, city: seed.city, state: "FL", postalCode: `3${String(3100 + index * 7)}` },
    preferredLanguage: "English",
    coverage: coverageOf(seed, index),
    escort: escortOf(seed, index),
    allergies: (seed.allergies ?? []).map(([substance, reaction, severity], allergyIndex) => ({
      id: `alg_${seed.id.slice(4)}_${allergyIndex}`,
      substance,
      reaction,
      severity,
    })),
    medications: (seed.meds ?? []).map((med, medIndex) => medicationOf(med, seed.id, medIndex)),
    referringProvider: "Dr. Karen Whitmore (Lakeside Family Medicine)",
    createdAt,
  }));
}
