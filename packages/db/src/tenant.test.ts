import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it } from 'vitest';

import { DatabaseError } from './db-error.js';
import { wrapTenantDb, type TenantDbClient, type TenantTx } from './tenant.js';

const VALID_TENANT_ID = '00000000-0000-4000-8000-000000000001';

function createMockDb(): {
  client: TenantDbClient;
  executedQueries: string[];
  getTransactionCount: () => number;
} {
  const executedQueries: string[] = [];
  let transactionCount = 0;

  const mockTx = new Proxy<TenantTx>({} as never, {
    get(_target, prop) {
      if (prop === 'execute') {
        return () => {
          executedQueries.push('set_config');
          return Promise.resolve([]);
        };
      }
      return undefined;
    },
  });

  const client: TenantDbClient = {
    async transaction<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
      transactionCount += 1;
      return fn(mockTx);
    },
  };

  return {
    client,
    executedQueries,
    getTransactionCount: () => transactionCount,
  };
}

describe('wrapTenantDb (hermetic unit tests)', () => {
  it('executes callback inside transaction without calling set_config for a valid UUID', async () => {
    const { client, executedQueries, getTransactionCount } = createMockDb();
    const tenantDb = wrapTenantDb(client);

    const result = await tenantDb.withTenant(VALID_TENANT_ID, () => Promise.resolve('callback-executed'));

    expect(result).toBe('callback-executed');
    expect(getTransactionCount()).toBe(1);
    expect(executedQueries).toEqual([]);
  });

  it('rejects a non-UUID string or empty string without touching the database', async () => {
    const { client, getTransactionCount } = createMockDb();
    const tenantDb = wrapTenantDb(client);

    await expect(tenantDb.withTenant('invalid-uuid', () => Promise.resolve())).rejects.toThrow(
      'tenantId must be a UUID',
    );
    await expect(tenantDb.withTenant('', () => Promise.resolve())).rejects.toThrow('tenantId must be a UUID');
    await expect(tenantDb.withTenant("x'; DROP TABLE agent_runs; --", () => Promise.resolve())).rejects.toThrow(
      'tenantId must be a UUID',
    );

    expect(getTransactionCount()).toBe(0);
  });

  it('propagates transaction rollbacks correctly when callback throws', async () => {
    const { client, getTransactionCount } = createMockDb();
    const tenantDb = wrapTenantDb(client);

    const boomError = new Error('transaction aborted by user code');
    await expect(
      tenantDb.withTenant(VALID_TENANT_ID, async () => {
        await Promise.resolve();
        throw boomError;
      }),
    ).rejects.toThrow(boomError);

    expect(getTransactionCount()).toBe(1);
  });

  it('safely maps driver errors to DatabaseError without leaking bound parameters', async () => {
    const executedQueries: string[] = [];
    const sensitiveParam = 'PATIENT-PHI-DO-NOT-LEAK';

    const failingDb: TenantDbClient = {
      transaction<T>(): Promise<T> {
        return Promise.reject(
          new DrizzleQueryError(
            'INSERT INTO agent_runs VALUES ($1)',
            [sensitiveParam],
            new Error('simulated driver connection failure'),
          ),
        );
      },
    };

    const tenantDb = wrapTenantDb(failingDb);

    let caughtError: Error | undefined;
    try {
      await tenantDb.withTenant(VALID_TENANT_ID, () => Promise.resolve());
    } catch (err) {
      if (err instanceof Error) caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(DatabaseError);
    expect(caughtError?.message).toBe('Database operation failed');
    expect(caughtError?.message).not.toContain(sensitiveParam);
    expect(executedQueries).toEqual([]);
  });
});
