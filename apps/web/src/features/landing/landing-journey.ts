/**
 * Shared ids that tie the three tellings of the patient journey together:
 * hero journey stations, product walkthrough chapters and workflow steps.
 *
 * - `chapter`: the walkthrough scene id in `product-mock.tsx`, or null when there is no scene for the stop.
 * - `stepAnchor`: DOM id of the matching workflow-section step, or null when the stop has no step of its own.
 */
export const JOURNEY_STOPS = [
  { id: "referral", chapter: "referral", stepAnchor: "step-referral" },
  { id: "schedule", chapter: null, stepAnchor: "step-schedule" },
  { id: "preop", chapter: "preop", stepAnchor: "step-preop" },
  { id: "procedure", chapter: "procedure", stepAnchor: "step-procedure" },
  { id: "pacu", chapter: "pacu", stepAnchor: "step-pacu" },
  { id: "coding", chapter: "coding", stepAnchor: "step-coding" },
  { id: "pathology", chapter: null, stepAnchor: "step-pathology" },
  { id: "recall", chapter: null, stepAnchor: "step-pathology" },
] as const;

/** DOM id of the product walkthrough wrapper (see `landing-hero.tsx`). */
export const PRODUCT_ANCHOR = "product";

/** Window event the walkthrough listens for; `detail` is a chapter id. */
export const OPEN_CHAPTER_EVENT = "landing:open-chapter";

/** Ask the product walkthrough to jump to a chapter (no-op if it is not mounted). */
export function openChapter(chapter: string) {
  window.dispatchEvent(new CustomEvent(OPEN_CHAPTER_EVENT, { detail: chapter }));
}

/** Smooth-scroll to an element by id, falling back to an instant jump for reduced-motion users. */
export function scrollToAnchor(id: string) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}
