import { describe, expect, it } from "vitest";
import {
  evaluateDuplicateMatch,
  type ExistingPatientSummary,
  type PatientMatchInput,
} from "./duplicate-match";

describe("evaluateDuplicateMatch", () => {
  const incoming: PatientMatchInput = {
    mrn: "MRN-1001",
    ecwId: "ECW-555",
    firstName: "Robert",
    lastName: "Smith",
    dateOfBirth: "1985-04-12",
    gender: "male",
  };

  it("returns no match when candidate list is empty", () => {
    const result = evaluateDuplicateMatch(incoming, []);
    expect(result).toEqual({
      hasMatch: false,
      highestConfidence: "none",
      matches: [],
    });
  });

  it("returns 100% confidence on exact MRN match", () => {
    const candidate: ExistingPatientSummary = {
      id: "pat-1",
      mrn: "MRN-1001",
      firstName: "Different",
      lastName: "Person",
      dateOfBirth: "1990-01-01",
    };
    const result = evaluateDuplicateMatch(incoming, [candidate]);
    expect(result.hasMatch).toBe(true);
    expect(result.highestConfidence).toBe("exact_identifier");
    expect(result.matches[0]).toMatchObject({
      patientId: "pat-1",
      confidence: "exact_identifier",
      score: 1.0,
      reasons: ["Exact MRN match"],
    });
  });

  it("returns 100% confidence on exact eCW match (case-insensitive)", () => {
    const candidate: ExistingPatientSummary = {
      id: "pat-2",
      ecwId: "ecw-555",
      firstName: "Other",
      lastName: "Person",
      dateOfBirth: "1992-02-02",
    };
    const result = evaluateDuplicateMatch(incoming, [candidate]);
    expect(result.hasMatch).toBe(true);
    expect(result.highestConfidence).toBe("exact_identifier");
    expect(result.matches[0]).toMatchObject({
      patientId: "pat-2",
      confidence: "exact_identifier",
      score: 1.0,
      reasons: ["Exact eCW patient ID match"],
    });
  });

  it("returns high confidence on exact Name + DOB + Gender match", () => {
    const patientWithoutIds: PatientMatchInput = {
      firstName: "Robert",
      lastName: "Smith",
      dateOfBirth: "1985-04-12",
      gender: "male",
    };
    const candidate: ExistingPatientSummary = {
      id: "pat-3",
      firstName: "robert",
      lastName: "smith",
      dateOfBirth: "1985-04-12",
      gender: "M",
    };
    const result = evaluateDuplicateMatch(patientWithoutIds, [candidate]);
    expect(result.hasMatch).toBe(true);
    expect(result.highestConfidence).toBe("high");
    expect(result.matches[0]).toMatchObject({
      patientId: "pat-3",
      confidence: "high",
      score: 0.9,
      reasons: ["Exact name, date of birth, and gender match"],
    });
  });

  it("returns high confidence when name + DOB match but gender is unspecified", () => {
    const patientWithoutGender: PatientMatchInput = {
      firstName: "Robert",
      lastName: "Smith",
      dateOfBirth: "1985-04-12",
    };
    const candidate: ExistingPatientSummary = {
      id: "pat-4",
      firstName: "Robert",
      lastName: "Smith",
      dateOfBirth: "1985-04-12",
      gender: "male",
    };
    const result = evaluateDuplicateMatch(patientWithoutGender, [candidate]);
    expect(result.hasMatch).toBe(true);
    expect(result.highestConfidence).toBe("high");
    expect(result.matches[0]?.score).toBe(0.85);
  });

  it("returns possible warning when name + DOB match but gender explicitly differs", () => {
    const patient: PatientMatchInput = {
      firstName: "Robert",
      lastName: "Smith",
      dateOfBirth: "1985-04-12",
      gender: "female",
    };
    const candidate: ExistingPatientSummary = {
      id: "pat-5",
      firstName: "Robert",
      lastName: "Smith",
      dateOfBirth: "1985-04-12",
      gender: "male",
    };
    const result = evaluateDuplicateMatch(patient, [candidate]);
    expect(result.hasMatch).toBe(true);
    expect(result.highestConfidence).toBe("possible");
    expect(result.matches[0]?.score).toBe(0.65);
  });

  it("returns medium warning (possible) on same DOB + last name + partial first name (prefix/nickname)", () => {
    const patient: PatientMatchInput = {
      firstName: "Rob",
      lastName: "Smith",
      dateOfBirth: "1985-04-12",
    };
    const candidate: ExistingPatientSummary = {
      id: "pat-6",
      firstName: "Robert",
      lastName: "Smith",
      dateOfBirth: "1985-04-12",
    };
    const result = evaluateDuplicateMatch(patient, [candidate]);
    expect(result.hasMatch).toBe(true);
    expect(result.highestConfidence).toBe("possible");
    expect(result.matches[0]).toMatchObject({
      patientId: "pat-6",
      confidence: "possible",
      score: 0.6,
      reasons: ["Matching date of birth, last name, and partial first name"],
    });
  });

  it("returns medium warning on same DOB + last name + first name typo (Levenshtein distance <= 1)", () => {
    const patient: PatientMatchInput = {
      firstName: "Jon",
      lastName: "Smith",
      dateOfBirth: "1985-04-12",
    };
    const candidate: ExistingPatientSummary = {
      id: "pat-7",
      firstName: "John",
      lastName: "Smith",
      dateOfBirth: "1985-04-12",
    };
    const result = evaluateDuplicateMatch(patient, [candidate]);
    expect(result.hasMatch).toBe(true);
    expect(result.highestConfidence).toBe("possible");
    expect(result.matches[0]?.score).toBe(0.6);
  });

  it("returns no match when DOB or last name does not match", () => {
    const candidate1: ExistingPatientSummary = {
      id: "pat-8",
      firstName: "Robert",
      lastName: "Jones",
      dateOfBirth: "1985-04-12",
    };
    const candidate2: ExistingPatientSummary = {
      id: "pat-9",
      firstName: "Robert",
      lastName: "Smith",
      dateOfBirth: "1990-01-01",
    };
    const result = evaluateDuplicateMatch(incoming, [candidate1, candidate2]);
    expect(result.hasMatch).toBe(false);
    expect(result.highestConfidence).toBe("none");
    expect(result.matches).toHaveLength(0);
  });

  it("orders multiple candidates descending by score", () => {
    const candidates: ExistingPatientSummary[] = [
      {
        id: "pat-partial",
        firstName: "Rob",
        lastName: "Smith",
        dateOfBirth: "1985-04-12",
      },
      {
        id: "pat-exact-id",
        mrn: "MRN-1001",
        firstName: "Robert",
        lastName: "Smith",
        dateOfBirth: "1985-04-12",
      },
      {
        id: "pat-exact-name",
        firstName: "Robert",
        lastName: "Smith",
        dateOfBirth: "1985-04-12",
        gender: "male",
      },
    ];
    const result = evaluateDuplicateMatch(incoming, candidates);
    expect(result.hasMatch).toBe(true);
    expect(result.highestConfidence).toBe("exact_identifier");
    expect(result.matches.map((m) => m.patientId)).toEqual([
      "pat-exact-id",
      "pat-exact-name",
      "pat-partial",
    ]);
  });
});
