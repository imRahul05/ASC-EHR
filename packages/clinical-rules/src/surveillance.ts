import type { PathologyResult, SurveillanceRecommendation } from "@asc/types";

const GUIDELINE = "USMSTF 2020 post-polypectomy surveillance (simplified for demo)";

interface IntervalRule {
  readonly applies: (results: readonly PathologyResult[]) => boolean;
  readonly intervalYears: number;
  readonly rationale: string;
}

const adenomas = (results: readonly PathologyResult[]) => results.filter((result) => result.isAdenoma);
const serrated = (results: readonly PathologyResult[]) =>
  results.filter((result) => result.histology === "sessile_serrated_lesion");
const isLarge = (result: PathologyResult) => (result.sizeMm ?? 0) >= 10;

/** First matching rule wins — ordered from highest to lowest risk. */
const INTERVAL_RULES: readonly IntervalRule[] = [
  {
    applies: (results) => results.some((result) => result.histology === "adenocarcinoma"),
    intervalYears: 1,
    rationale: "Adenocarcinoma — refer; colonoscopy at 1 year after resection.",
  },
  {
    applies: (results) =>
      adenomas(results).some(
        (result) => isLarge(result) || result.dysplasia === "high_grade" || result.histology !== "tubular_adenoma",
      ) || adenomas(results).length >= 5,
    intervalYears: 3,
    rationale: "Advanced adenoma (≥ 10 mm, villous, or high-grade dysplasia) or ≥ 5 adenomas.",
  },
  {
    applies: (results) => serrated(results).some(isLarge) || serrated(results).length >= 3,
    intervalYears: 3,
    rationale: "Sessile serrated lesion ≥ 10 mm or ≥ 3 serrated lesions.",
  },
  {
    applies: (results) => adenomas(results).length >= 3 || serrated(results).length > 0,
    intervalYears: 5,
    rationale: "3–4 tubular adenomas < 10 mm, or 1–2 sessile serrated lesions < 10 mm.",
  },
  {
    applies: (results) => adenomas(results).length > 0,
    intervalYears: 7,
    rationale: "1–2 tubular adenomas < 10 mm.",
  },
];

const NORMAL: IntervalRule = {
  applies: () => true,
  intervalYears: 10,
  rationale: "No adenomas or serrated lesions (normal / hyperplastic < 10 mm).",
};

/** Recommended surveillance interval from the case's pathology results. */
export function surveillanceInterval(results: readonly PathologyResult[]): SurveillanceRecommendation {
  const rule = INTERVAL_RULES.find((candidate) => candidate.applies(results)) ?? NORMAL;
  return { intervalYears: rule.intervalYears, rationale: rule.rationale, guideline: GUIDELINE };
}
