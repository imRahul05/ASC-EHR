import type { ExtractedFact, Referral, ReferralFactField } from "@asc/types";
import { isoAt } from "./util";

/** Synthetic faxed referrals (invented practices, people and numbers). */

interface ReferralSeed {
  readonly id: string;
  readonly receivedOffsetMin: number;
  readonly fromPractice: string;
  readonly fromProvider: string;
  readonly priority: Referral["priority"];
  readonly status: Referral["status"];
  readonly lines: readonly string[];
  readonly facts: readonly (readonly [field: ReferralFactField, label: string, value: string, confidence: number])[];
}

const SEEDS: readonly ReferralSeed[] = [
  {
    id: "ref_201",
    receivedOffsetMin: -95,
    fromPractice: "Lakeside Family Medicine",
    fromProvider: "Dr. Karen Whitmore",
    priority: "routine",
    status: "new",
    lines: [
      "LAKESIDE FAMILY MEDICINE — REFERRAL FOR GI CONSULTATION",
      "Patient: Evelyn Park    DOB: 04/22/1967    Sex: F",
      "Phone: (555) 0172-4410",
      "Insurance: Aetna Choice POS II  Member ID: AET552019384",
      "Reason for referral: Average-risk colorectal cancer screening, age 58, no prior colonoscopy.",
      "Requested: Screening colonoscopy",
      "Current medications: Lisinopril 10 mg daily",
      "Allergies: NKDA",
      "Referring: Dr. Karen Whitmore, MD  NPI 1942087731",
    ],
    facts: [
      ["patientName", "Patient name", "Evelyn Park", 0.99],
      ["dateOfBirth", "Date of birth", "04/22/1967", 0.98],
      ["sex", "Sex", "F", 0.97],
      ["phone", "Phone", "(555) 0172-4410", 0.95],
      ["payer", "Payer", "Aetna Choice POS II", 0.93],
      ["memberId", "Member ID", "AET552019384", 0.91],
      ["reason", "Reason", "Average-risk colorectal cancer screening, age 58, no prior colonoscopy.", 0.94],
      ["requestedProcedure", "Requested procedure", "Screening colonoscopy", 0.96],
      ["medications", "Medications", "Lisinopril 10 mg daily", 0.9],
      ["allergies", "Allergies", "NKDA", 0.92],
      ["referringProvider", "Referring provider", "Dr. Karen Whitmore, MD", 0.97],
    ],
  },
  {
    id: "ref_202",
    receivedOffsetMin: -240,
    fromPractice: "Northgate Internal Medicine",
    fromProvider: "Dr. Omar Haddad",
    priority: "urgent",
    status: "new",
    lines: [
      "NORTHGATE INTERNAL MEDICINE",
      "URGENT referral — gastroenterology",
      "Pt: Frank Delaney   D.O.B. 12/01/1952   M",
      "Tel (555) 0188-2291",
      "Coverage: Medicare Part B   MBI 7XK2-TE4-MR91",
      "Hx: Iron-deficiency anemia (Hgb 9.8), heme-positive stool. Please evaluate with EGD and colonoscopy.",
      "Meds: warfarin 5 mg daily (AFib), ferrous sulfate 325 mg daily",
      "Allergies: penicillin (rash)",
      "Dr. Omar Haddad, DO",
    ],
    facts: [
      ["patientName", "Patient name", "Frank Delaney", 0.98],
      ["dateOfBirth", "Date of birth", "12/01/1952", 0.96],
      ["sex", "Sex", "M", 0.9],
      ["phone", "Phone", "(555) 0188-2291", 0.94],
      ["payer", "Payer", "Medicare Part B", 0.95],
      ["memberId", "Member ID", "7XK2-TE4-MR91", 0.83],
      ["reason", "Reason", "Iron-deficiency anemia (Hgb 9.8), heme-positive stool.", 0.92],
      ["requestedProcedure", "Requested procedure", "EGD and colonoscopy", 0.9],
      ["medications", "Medications", "warfarin 5 mg daily (AFib), ferrous sulfate 325 mg daily", 0.88],
      ["allergies", "Allergies", "penicillin (rash)", 0.93],
      ["referringProvider", "Referring provider", "Dr. Omar Haddad, DO", 0.96],
    ],
  },
  {
    id: "ref_203",
    receivedOffsetMin: -1500,
    fromPractice: "Riverside Primary Care",
    fromProvider: "Dr. Julia Moss",
    priority: "routine",
    status: "in_review",
    lines: [
      "Riverside Primary Care — Referral",
      "Name: Angela Brooks  DOB 08/02/1972  F",
      "Phone (555) 0141-3153",
      "Plan: Aetna Choice POS II, ID AET482198219",
      "Indication: Surveillance colonoscopy — tubular adenoma removed 2021.",
      "Medications: levothyroxine 75 mcg",
      "Allergy: sulfa (rash)",
      "Dr. Julia Moss, MD",
    ],
    facts: [
      ["patientName", "Patient name", "Angela Brooks", 0.99],
      ["dateOfBirth", "Date of birth", "08/02/1972", 0.97],
      ["sex", "Sex", "F", 0.96],
      ["phone", "Phone", "(555) 0141-3153", 0.9],
      ["payer", "Payer", "Aetna Choice POS II", 0.94],
      ["memberId", "Member ID", "AET482198219", 0.86],
      ["reason", "Reason", "Surveillance colonoscopy — tubular adenoma removed 2021.", 0.95],
      ["requestedProcedure", "Requested procedure", "Surveillance colonoscopy", 0.93],
      ["medications", "Medications", "levothyroxine 75 mcg", 0.91],
      ["allergies", "Allergies", "sulfa (rash)", 0.94],
      ["referringProvider", "Referring provider", "Dr. Julia Moss, MD", 0.97],
    ],
  },
  {
    id: "ref_204",
    receivedOffsetMin: -30,
    fromPractice: "Harbor Women's Health",
    fromProvider: "Dr. Nina Patel",
    priority: "routine",
    status: "new",
    lines: [
      "HARBOR WOMEN'S HEALTH — GI REFERRAL",
      "Patient Carmen Diaz, born 09/15/1976, female",
      "Contact: (555) 0163-7702",
      "Insurance: Cigna Open Access Plus, member CIG730041928",
      "Reason: intermittent bright red blood per rectum x 3 months; diagnostic colonoscopy requested.",
      "Medications: semaglutide 1 mg weekly, metformin 1000 mg BID",
      "Allergies: none known",
      "Nina Patel, MD",
    ],
    facts: [
      ["patientName", "Patient name", "Carmen Diaz", 0.98],
      ["dateOfBirth", "Date of birth", "09/15/1976", 0.95],
      ["sex", "Sex", "female", 0.94],
      ["phone", "Phone", "(555) 0163-7702", 0.93],
      ["payer", "Payer", "Cigna Open Access Plus", 0.92],
      ["memberId", "Member ID", "CIG730041928", 0.9],
      ["reason", "Reason", "intermittent bright red blood per rectum x 3 months", 0.91],
      ["requestedProcedure", "Requested procedure", "diagnostic colonoscopy", 0.94],
      ["medications", "Medications", "semaglutide 1 mg weekly, metformin 1000 mg BID", 0.89],
      ["allergies", "Allergies", "none known", 0.9],
      ["referringProvider", "Referring provider", "Nina Patel, MD", 0.95],
    ],
  },
];

function factsWithSpans(seed: ReferralSeed, text: string): ExtractedFact[] {
  return seed.facts.map(([field, label, value, confidence], index) => {
    const start = Math.max(0, text.indexOf(value));
    return {
      id: `${seed.id}_f${index}`,
      field,
      label,
      value,
      confidence,
      sourceSpan: { page: 1, start, end: start + value.length },
    };
  });
}

export function seedReferrals(anchorMs: number): Referral[] {
  return SEEDS.map((seed) => {
    const documentText = seed.lines.join("\n");
    const receivedAt = isoAt(anchorMs, seed.receivedOffsetMin);
    return {
      id: seed.id,
      receivedAt,
      channel: "fax",
      fromPractice: seed.fromPractice,
      fromProvider: seed.fromProvider,
      pageCount: 1,
      priority: seed.priority,
      status: seed.status,
      documentText,
      extractedFacts: factsWithSpans(seed, documentText),
      provenance: {
        agent: "referral_extraction",
        model: "Tier: fast (BAA-hosted)",
        promptVersion: "referral_extraction@1.3.0",
        generatedAt: receivedAt,
      },
    };
  });
}
