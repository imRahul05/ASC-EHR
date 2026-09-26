/**
 * Context manifest, derived PHI flag and content hashing.
 *
 * The manifest is what gets persisted about a run's context (on the run record;
 * the audit event gets only its size and hash) — all metadata, never values.
 */

import type { ContextItem, ContextItemMeta, ContextManifestEntry } from './types.js';

/** Item metadata without values, in item order. */
export function buildContextManifest(items: readonly ContextItem[]): ContextManifestEntry[] {
  return items.map(({ value: _value, ...meta }): ContextItemMeta => meta);
}

/** True if any item is PHI. Used to escalate `containsPhi` — never to lower it. */
export function containsPhiFromContext(items: readonly Pick<ContextItemMeta, 'sensitivity'>[]): boolean {
  return items.some((item) => item.sensitivity === 'phi');
}

/**
 * JSON with object keys sorted at every level, so equal values hash equally
 * whatever their key order. Follows JSON.stringify for everything else
 * (`toJSON`, undefined / function properties dropped, undefined in arrays → null).
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value)) ?? 'null';
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if ('toJSON' in value && typeof value.toJSON === 'function') {
    return sortKeys((value.toJSON as () => unknown).call(value));
  }
  if (Array.isArray(value)) return value.map(sortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/** `sha256:<hex>` of `stableStringify(value)` (Web Crypto, global in Node >= 19). */
export async function computeContentHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableStringify(value)));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}
