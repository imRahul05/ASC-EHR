import type { AccessRequestFormData } from "@asc/validation/auth";

// Pending access requests, in memory only (a reload forgets them). The admin console will list
// them once invitations exist; for now they only prove the request path end to end.
const pending: AccessRequestFormData[] = [];

export function addAccessRequest(request: AccessRequestFormData): void {
  pending.push(request);
}

export function pendingAccessRequests(): readonly AccessRequestFormData[] {
  return pending;
}
