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
};
