import type { WorkItem, WorkItemType } from "@asc/types";

/** Where each work item type is worked (case tab, patient chart or referral inbox) — IDs only in URLs. */
const TARGET: Readonly<Record<WorkItemType, (item: WorkItem) => string>> = {
  sign_note: (item) => `/cases/${item.caseId ?? ""}?tab=note`,
  eligibility_failed: (item) => (item.patientId ? `/patients/${item.patientId}` : `/cases/${item.caseId ?? ""}?tab=pre-procedure`),
  referral_intake: () => "/referrals",
  pending_pathology: (item) => `/cases/${item.caseId ?? ""}?tab=pathology`,
  coding: (item) => `/cases/${item.caseId ?? ""}?tab=coding`,
  result_letter: (item) => `/cases/${item.caseId ?? ""}?tab=pathology`,
  med_hold_review: (item) => `/cases/${item.caseId ?? ""}?tab=pre-procedure`,
  prep_instructions: (item) => `/cases/${item.caseId ?? ""}?tab=pre-procedure`,
  records_request: (item) => `/cases/${item.caseId ?? ""}?tab=pre-procedure`,
  eligibility_recheck: (item) => `/cases/${item.caseId ?? ""}?tab=financial`,
  estimate_delivery: (item) => `/cases/${item.caseId ?? ""}?tab=financial`,
  preop_call: (item) => `/cases/${item.caseId ?? ""}?tab=pre-procedure`,
  anesthesia_review: (item) => `/cases/${item.caseId ?? ""}?tab=pre-procedure`,
  prep_reminder: (item) => `/cases/${item.caseId ?? ""}?tab=pre-procedure`,
  final_confirmation: (item) => `/cases/${item.caseId ?? ""}?tab=pre-procedure`,
  dayof_prep_check: (item) => `/cases/${item.caseId ?? ""}?tab=pre-procedure`,
  hp_expiring: (item) => `/cases/${item.caseId ?? ""}?tab=pre-procedure`,
  auth_revalidation: (item) => `/cases/${item.caseId ?? ""}?tab=financial`,
  cancelled_followup: (item) => `/cases/${item.caseId ?? ""}?tab=pre-procedure`,
};

export function workItemHref(item: WorkItem): string {
  return TARGET[item.type](item);
}

export const WORK_ITEM_TYPE_LABEL: Readonly<Record<WorkItemType, string>> = {
  sign_note: "Sign queue",
  eligibility_failed: "Eligibility failures",
  referral_intake: "Referral intake",
  pending_pathology: "Pending pathology",
  coding: "Coding",
  result_letter: "Result letters",
  med_hold_review: "Med hold review",
  prep_instructions: "Prep instructions",
  records_request: "Records request",
  eligibility_recheck: "Eligibility re-check",
  estimate_delivery: "Estimate delivery",
  preop_call: "Pre-op call",
  anesthesia_review: "Anesthesia review",
  prep_reminder: "Prep reminder",
  final_confirmation: "Final confirmation",
  dayof_prep_check: "Day-of prep check",
  hp_expiring: "H&P expiring",
  auth_revalidation: "Prior auth revalidation",
  cancelled_followup: "Cancelled follow-up",
};
