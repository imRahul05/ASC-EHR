/**
 * AIMS Cumulative Sedation Dose Advisory Engine.
 *
 * US Healthcare Regulations & Clinical Standards:
 * - US-F-08: Sedation Medication Administration Log & Cumulative Dose Safety Alerts.
 * - ASGE Guidelines for Sedation in Gastrointestinal Endoscopy:
 *   Advises vigilance when cumulative doses exceed standard procedural benchmarks to prevent
 *   unintended deep sedation, respiratory depression, and hypoventilation.
 * - ASA Practice Guidelines for Moderate Procedural Sedation and Analgesia.
 */

import type { AnesthesiaDrug, DoseUnit, DrugDose } from "@asc/types";

export interface DoseAdvisoryThreshold {
  readonly warnThreshold: number;
  readonly unit: DoseUnit;
  readonly rationale: string;
}

export const ANESTHESIA_DOSE_THRESHOLDS: Readonly<Record<AnesthesiaDrug, DoseAdvisoryThreshold>> = {
  fentanyl: {
    warnThreshold: 200,
    unit: "mcg",
    rationale: "Cumulative dose >= 200 mcg increases severe opioid-induced hypoventilation and chest wall rigidity risks.",
  },
  midazolam: {
    warnThreshold: 5,
    unit: "mg",
    rationale: "Cumulative dose >= 5 mg increases prolonged recovery and paradoxical agitation risks.",
  },
  propofol: {
    warnThreshold: 300,
    unit: "mg",
    rationale: "Cumulative dose >= 300 mg approaches deep sedation; verify continuous airway patency.",
  },
  lidocaine: {
    warnThreshold: 300,
    unit: "mg",
    rationale: "Approaching local anesthetic systemic toxicity (LAST) threshold.",
  },
  glycopyrrolate: {
    warnThreshold: 0.4,
    unit: "mg",
    rationale: "Elevated dose increases tachyarrhythmia and prolonged dry mouth risks.",
  },
  ephedrine: {
    warnThreshold: 25,
    unit: "mg",
    rationale: "Cumulative dose >= 25 mg risks tachyphylaxis and rebound severe hypertension.",
  },
  phenylephrine: {
    warnThreshold: 500,
    unit: "mcg",
    rationale: "Cumulative dose >= 500 mcg risks excessive afterload and reflex severe bradycardia.",
  },
  ondansetron: {
    warnThreshold: 8,
    unit: "mg",
    rationale: "Doses exceeding 8 mg IV single administration increase QTc prolongation risk.",
  },
  naloxone: {
    warnThreshold: 2,
    unit: "mg",
    rationale: "Cumulative dose >= 2 mg with lack of response warrants consideration of non-opioid etiology.",
  },
  flumazenil: {
    warnThreshold: 1,
    unit: "mg",
    rationale: "Cumulative dose >= 1 mg increases seizure risk, especially in chronic benzodiazepine tolerance.",
  },
};

export interface DoseAdvisoryWarning {
  readonly drug: AnesthesiaDrug;
  readonly totalDose: number;
  readonly warnThreshold: number;
  readonly unit: DoseUnit;
  readonly message: string;
}

/**
 * Calculates cumulative administered doses per drug and emits advisory warnings
 * if established safety thresholds are breached.
 *
 * @param doses - Administered drug doses from the AIMS flowsheet.
 */
export function evaluateCumulativeDoses(doses: readonly DrugDose[]): readonly DoseAdvisoryWarning[] {
  const totalsByDrug = new Map<AnesthesiaDrug, { amount: number; unit: DoseUnit }>();

  for (const dose of doses) {
    const existing = totalsByDrug.get(dose.drug);
    if (!existing) {
      totalsByDrug.set(dose.drug, { amount: dose.amount, unit: dose.unit });
    } else {
      totalsByDrug.set(dose.drug, {
        amount: existing.amount + dose.amount,
        unit: dose.unit,
      });
    }
  }

  const warnings: DoseAdvisoryWarning[] = [];

  for (const [drug, { amount, unit }] of totalsByDrug.entries()) {
    const threshold = ANESTHESIA_DOSE_THRESHOLDS[drug];
    if (threshold && amount >= threshold.warnThreshold) {
      warnings.push({
        drug,
        totalDose: Math.round(amount * 100) / 100,
        warnThreshold: threshold.warnThreshold,
        unit,
        message: `Cumulative ${drug} dose (${amount} ${unit}) reached safety advisory threshold (${threshold.warnThreshold} ${threshold.unit}). ${threshold.rationale}`,
      });
    }
  }

  return warnings;
}
