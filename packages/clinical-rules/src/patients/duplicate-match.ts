export interface PatientMatchInput {
  readonly mrn?: string;
  readonly ecwId?: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: string;
  readonly gender?: string;
}

export interface ExistingPatientSummary {
  readonly id: string;
  readonly mrn?: string;
  readonly ecwId?: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: string;
  readonly gender?: string;
}

export type DuplicateMatchConfidence = "exact_identifier" | "high" | "possible";

export interface DuplicateCandidateMatch {
  readonly patientId: string;
  readonly confidence: DuplicateMatchConfidence;
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface DuplicateMatchResult {
  readonly hasMatch: boolean;
  readonly highestConfidence: DuplicateMatchConfidence | "none";
  readonly matches: readonly DuplicateCandidateMatch[];
}

function normalizeString(value: string | undefined): string {
  if (value === undefined) return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeGender(value: string | undefined): string {
  const norm = normalizeString(value);
  if (norm === "m" || norm === "male") return "male";
  if (norm === "f" || norm === "female") return "female";
  if (norm === "o" || norm === "other") return "other";
  return norm;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j]! + 1,
        );
      }
    }
  }
  return matrix[b.length]![a.length]!;
}

function isPartialFirstNameMatch(nameA: string, nameB: string): boolean {
  if (nameA.length === 0 || nameB.length === 0) return false;
  if (nameA === nameB) return true;
  if (nameA.startsWith(nameB) || nameB.startsWith(nameA)) return true;
  if (Math.min(nameA.length, nameB.length) >= 3 && levenshteinDistance(nameA, nameB) <= 1) {
    return true;
  }
  return false;
}

/**
 * Deterministic evaluation of duplicate patient candidates.
 * Compares incoming patient against existing candidates:
 * - Exact MRN or eCW match -> 100% confidence ("exact_identifier", score 1.0)
 * - Exact Name + DOB + Gender match -> high confidence ("high", score 0.9)
 * - Same DOB + matching last name + partial first name -> medium warning ("possible", score 0.6)
 */
export function evaluateDuplicateMatch(
  incoming: PatientMatchInput,
  existing: readonly ExistingPatientSummary[],
): DuplicateMatchResult {
  const incomingMrn = normalizeString(incoming.mrn);
  const incomingEcw = normalizeString(incoming.ecwId);
  const incomingFirst = normalizeString(incoming.firstName);
  const incomingLast = normalizeString(incoming.lastName);
  const incomingDob = normalizeString(incoming.dateOfBirth);
  const incomingGender = normalizeGender(incoming.gender);

  const matches: DuplicateCandidateMatch[] = [];

  for (const candidate of existing) {
    const candidateMrn = normalizeString(candidate.mrn);
    const candidateEcw = normalizeString(candidate.ecwId);
    const candidateFirst = normalizeString(candidate.firstName);
    const candidateLast = normalizeString(candidate.lastName);
    const candidateDob = normalizeString(candidate.dateOfBirth);
    const candidateGender = normalizeGender(candidate.gender);

    const reasons: string[] = [];

    // 1. Exact identifier match (100% confidence)
    const hasMrnMatch = incomingMrn !== "" && candidateMrn !== "" && incomingMrn === candidateMrn;
    const hasEcwMatch = incomingEcw !== "" && candidateEcw !== "" && incomingEcw === candidateEcw;

    if (hasMrnMatch || hasEcwMatch) {
      if (hasMrnMatch) reasons.push("Exact MRN match");
      if (hasEcwMatch) reasons.push("Exact eCW patient ID match");
      matches.push({
        patientId: candidate.id,
        confidence: "exact_identifier",
        score: 1.0,
        reasons,
      });
      continue;
    }

    // 2. Exact Name + DOB + Gender match (high confidence)
    const isSameDob = incomingDob !== "" && incomingDob === candidateDob;
    const isSameLastName = incomingLast !== "" && incomingLast === candidateLast;
    const isSameFirstName = incomingFirst !== "" && incomingFirst === candidateFirst;

    if (isSameDob && isSameLastName && isSameFirstName) {
      const hasGenderMatch =
        incomingGender !== "" && candidateGender !== "" && incomingGender === candidateGender;

      if (hasGenderMatch) {
        matches.push({
          patientId: candidate.id,
          confidence: "high",
          score: 0.9,
          reasons: ["Exact name, date of birth, and gender match"],
        });
        continue;
      }

      if (incomingGender === "" || candidateGender === "") {
        matches.push({
          patientId: candidate.id,
          confidence: "high",
          score: 0.85,
          reasons: ["Exact name and date of birth match"],
        });
        continue;
      }

      matches.push({
        patientId: candidate.id,
        confidence: "possible",
        score: 0.65,
        reasons: ["Exact name and date of birth match, but gender differs"],
      });
      continue;
    }

    // 3. Same DOB + matching last name + partial first name (possible warning)
    if (isSameDob && isSameLastName && isPartialFirstNameMatch(incomingFirst, candidateFirst)) {
      matches.push({
        patientId: candidate.id,
        confidence: "possible",
        score: 0.6,
        reasons: ["Matching date of birth, last name, and partial first name"],
      });
      continue;
    }
  }

  matches.sort((a, b) => b.score - a.score);

  if (matches.length === 0) {
    return {
      hasMatch: false,
      highestConfidence: "none",
      matches: [],
    };
  }

  const highest = matches[0]?.confidence ?? "none";
  return {
    hasMatch: true,
    highestConfidence: highest,
    matches,
  };
}
