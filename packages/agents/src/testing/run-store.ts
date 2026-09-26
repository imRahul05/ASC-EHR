/**
 * In-memory reference implementation of AgentRunStore — the contract the
 * apps' Postgres store must satisfy. Tests only, not exported from the package:
 * it is neither durable nor encrypted, and run records hold PHI.
 */

import type {
  AgentRunBeginResult,
  AgentRunRecord,
  AgentRunStart,
  AgentRunStore,
} from '../state/run-store.js';
import { isSameRunOwner } from '../state/run-store.js';

export class InMemoryAgentRunStore implements AgentRunStore {
  /** Keyed by executionId. Read via `get` (copies), not directly, outside tests. */
  readonly records = new Map<string, AgentRunRecord>();
  private readonly now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
  }

  // Each method runs synchronously up to its return, so it is atomic on the event loop.
  begin(start: AgentRunStart, options: { staleAfterMs: number }): Promise<AgentRunBeginResult> {
    const now = this.now();
    const at = now.toISOString();
    const existing = this.records.get(start.executionId);

    if (!existing) {
      const record: AgentRunRecord = { ...start, status: 'running', claim: 1, createdAt: at, startedAt: at, updatedAt: at };
      this.records.set(start.executionId, record);
      return Promise.resolve({ claimed: true, record: structuredClone(record) });
    }

    const stale = existing.status === 'running' && now.getTime() - Date.parse(existing.startedAt) > options.staleAfterMs;
    if (!isSameRunOwner(existing, start) || !(existing.status === 'failed' || stale)) {
      return Promise.resolve({ claimed: false, record: structuredClone(existing) });
    }

    const record: AgentRunRecord = {
      ...start,
      status: 'running',
      claim: existing.claim + 1,
      createdAt: existing.createdAt,
      startedAt: at,
      updatedAt: at,
    };
    this.records.set(start.executionId, record);
    return Promise.resolve({ claimed: true, record: structuredClone(record) });
  }

  succeed(
    executionId: string,
    { claim, output, meta }: Parameters<AgentRunStore['succeed']>[1],
  ): Promise<boolean> {
    return Promise.resolve(
      this.finish(executionId, claim, { status: 'succeeded', output: structuredClone(output), meta: structuredClone(meta) }),
    );
  }

  fail(executionId: string, { claim, failureKind, errorName }: Parameters<AgentRunStore['fail']>[1]): Promise<boolean> {
    return Promise.resolve(this.finish(executionId, claim, { status: 'failed', failureKind, errorName }));
  }

  get(executionId: string): Promise<AgentRunRecord | undefined> {
    const record = this.records.get(executionId);
    return Promise.resolve(record && structuredClone(record));
  }

  private finish(executionId: string, claim: number, update: Partial<AgentRunRecord>): boolean {
    const existing = this.records.get(executionId);
    if (existing?.status !== 'running' || existing.claim !== claim) return false;
    const at = this.now().toISOString();
    this.records.set(executionId, { ...existing, ...update, updatedAt: at, finishedAt: at });
    return true;
  }
}
