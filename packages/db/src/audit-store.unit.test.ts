import type { AuditEvent } from '@asc/audit';
import { describe, expect, it } from 'vitest';

import {
  AuditTenantMissingError,
  createPostgresAuditStore,
  DEFAULT_SINGLE_FACILITY_TENANT_ID,
} from './audit-store.js';
import type { TenantDb, TenantTx } from './tenant.js';

interface InsertedRow {
  tenantId?: string;
  facilityId?: string | null;
  action?: string;
  actorType?: string;
  actorId?: string;
  outcome?: string;
}

function createMockTenantDb(): {
  tenantDb: TenantDb;
  getRecordedTenantId: () => string;
  getInsertedRow: () => InsertedRow;
} {
  let recordedTenantId = '';
  let insertedRow: InsertedRow = {};

  const mockTx = new Proxy<TenantTx>({} as never, {
    get(_target, prop) {
      if (prop === 'insert') {
        return () => ({
          values: (row: InsertedRow) => {
            insertedRow = row;
            return Promise.resolve();
          },
        });
      }
      return undefined;
    },
  });

  const tenantDb: TenantDb = {
    async withTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
      recordedTenantId = tenantId;
      return fn(mockTx);
    },
  };

  return {
    tenantDb,
    getRecordedTenantId: () => recordedTenantId,
    getInsertedRow: () => insertedRow,
  };
}

function createBaseEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    action: 'case.schedule',
    actorType: 'user',
    actorId: 'usr_001',
    outcome: 'SUCCESS',
    timestamp: '2026-10-14T12:00:00.000Z',
    ...overrides,
  };
}

describe('createPostgresAuditStore (hermetic unit tests)', () => {
  it('passes event.tenantId to withTenant when tenantId is present on the event', async () => {
    const { tenantDb, getRecordedTenantId, getInsertedRow } = createMockTenantDb();
    const store = createPostgresAuditStore(tenantDb);

    const explicitTenantId = '11111111-2222-4333-8444-555555555555';
    const event = createBaseEvent({ tenantId: explicitTenantId, facilityId: 'fac_main' });

    await store.save(event);

    expect(getRecordedTenantId()).toBe(explicitTenantId);
    expect(getInsertedRow().tenantId).toBe(explicitTenantId);
    expect(getInsertedRow().facilityId).toBe('fac_main');
  });

  it('uses DEFAULT_SINGLE_FACILITY_TENANT_ID when no tenant is provided on the event or in options, without throwing AuditTenantMissingError', async () => {
    const { tenantDb, getRecordedTenantId, getInsertedRow } = createMockTenantDb();
    const store = createPostgresAuditStore(tenantDb);

    const event = createBaseEvent();
    expect(event.tenantId).toBeUndefined();

    await expect(store.save(event)).resolves.not.toThrow();

    expect(getRecordedTenantId()).toBe(DEFAULT_SINGLE_FACILITY_TENANT_ID);
    expect(getInsertedRow().tenantId).toBe(DEFAULT_SINGLE_FACILITY_TENANT_ID);
  });

  it('falls back to DEFAULT_SINGLE_FACILITY_TENANT_ID when options explicitly pass undefined defaultTenantId', async () => {
    const { tenantDb, getRecordedTenantId, getInsertedRow } = createMockTenantDb();
    const store = createPostgresAuditStore(tenantDb, { defaultTenantId: undefined });

    const event = createBaseEvent();
    await store.save(event);

    expect(getRecordedTenantId()).toBe(DEFAULT_SINGLE_FACILITY_TENANT_ID);
    expect(getInsertedRow().tenantId).toBe(DEFAULT_SINGLE_FACILITY_TENANT_ID);
  });

  it('respects a configured defaultTenantId when event carries no tenantId', async () => {
    const { tenantDb, getRecordedTenantId, getInsertedRow } = createMockTenantDb();
    const customTenantId = '99999999-9999-4999-8999-999999999999';
    const store = createPostgresAuditStore(tenantDb, { defaultTenantId: customTenantId });

    const event = createBaseEvent();
    await store.save(event);

    expect(getRecordedTenantId()).toBe(customTenantId);
    expect(getInsertedRow().tenantId).toBe(customTenantId);
  });

  it('preserves AuditTenantMissingError class for backward compatibility', () => {
    const error = new AuditTenantMissingError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AuditTenantMissingError');
  });
});
