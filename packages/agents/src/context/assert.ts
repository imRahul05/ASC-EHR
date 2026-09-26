/**
 * Pre-flight checks on a run's context, run before any model is called.
 *
 * PHI rule: errors list item keys and scope field names only — never values or ids.
 */

import type { ContextItemMeta, RunScope } from './types.js';

type ScopeField = keyof RunScope;

/** A context item belongs to another org / patient / case than the run. */
export class ContextScopeError extends Error {
  override readonly name = 'ContextScopeError';
  readonly mismatches: readonly { key: string; field: ScopeField }[];

  constructor(mismatches: readonly { key: string; field: ScopeField }[]) {
    super(
      `Context is out of the run's scope: ${mismatches.map((m) => `${m.key} (${m.field})`).join(', ')}.`,
    );
    this.mismatches = mismatches;
  }
}

/** One or more context items are past `maxAgeMs` / `validUntil` (or carry unreadable timestamps). */
export class StaleContextError extends Error {
  override readonly name = 'StaleContextError';
  readonly keys: readonly string[];

  constructor(keys: readonly string[]) {
    super(`Stale context: ${keys.join(', ')}.`);
    this.keys = keys;
  }
}

/**
 * Throws ContextScopeError unless every item belongs to the run: same org;
 * a patient- or case-scoped item only in a run for that same patient / case.
 * Org-level items (config, knowledge) have no patient / case and fit any run of the org.
 */
export function assertContextScope(items: readonly ContextItemMeta[], runScope: RunScope): void {
  const mismatches: { key: string; field: ScopeField }[] = [];
  for (const item of items) {
    if (item.scope.orgId !== runScope.orgId) mismatches.push({ key: item.key, field: 'orgId' });
    for (const field of ['patientId', 'caseId'] as const) {
      const own = item.scope[field];
      if (own !== undefined && own !== runScope[field]) mismatches.push({ key: item.key, field });
    }
  }
  if (mismatches.length > 0) throw new ContextScopeError(mismatches);
}

/**
 * Throws StaleContextError listing the keys of items past `validUntil`, or
 * older than `maxAgeMs` (measured from `effectiveAt`, else `retrievedAt`).
 * Unparseable timestamps count as stale: fail closed.
 */
export function assertContextFresh(items: readonly ContextItemMeta[], now: Date): void {
  const at = now.getTime();
  const stale = items.filter((item) => {
    if (item.validUntil !== undefined) {
      const until = Date.parse(item.validUntil);
      if (Number.isNaN(until) || at > until) return true;
    }
    if (item.maxAgeMs !== undefined) {
      const since = Date.parse(item.effectiveAt ?? item.retrievedAt);
      if (Number.isNaN(since) || at - since > item.maxAgeMs) return true;
    }
    return false;
  });
  if (stale.length > 0) throw new StaleContextError(stale.map((item) => item.key));
}
