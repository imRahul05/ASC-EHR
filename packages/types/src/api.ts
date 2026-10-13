import type { DuplicateMatchResult } from "./clinical.js";

/** Error body returned by apps/api (and the dev mocks) for any non-2xx response. */
export interface ApiErrorPayload {
  readonly message?: string;
  readonly code?: string;
  readonly details?: Record<string, string>;
  readonly duplicateMatch?: DuplicateMatchResult;
}

/** Normalised error thrown by @asc/api-client for every failed request. */
export interface ApiErrorDetails {
  readonly status: number;
  readonly message: string;
  readonly code?: string;
  readonly details?: Record<string, string>;
  readonly duplicateMatch?: DuplicateMatchResult;
}

/** Concurrency control interface for serializing facility operations across instances. */
export interface FacilityRegistrationLock {
  withLock<T>(facilityId: string, operation: () => Promise<T>, tenantId?: string): Promise<T>;
}
