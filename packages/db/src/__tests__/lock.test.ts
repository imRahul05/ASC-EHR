import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withPostgresFacilityLock } from '../lock.js';
import { connectRuntime, createTestSchema, runtimeUrl, type RuntimeAccess, type TestSchema } from './test-db.js';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('withPostgresFacilityLock', () => {
  let schema: TestSchema;
  let runtime: RuntimeAccess;
  const tenantId = randomUUID();

  beforeAll(async () => {
    schema = await createTestSchema(url!, 'lock_test');
    runtime = connectRuntime(runtimeUrl(url!, process.env.TEST_RUNTIME_DATABASE_URL), schema.schemaName);
  });

  afterAll(async () => {
    await runtime?.close();
    await schema?.drop();
  });

  it('serializes concurrent operations for the same facility', async () => {
    const facilityId = 'facility-lock-1';
    const executionOrder: string[] = [];

    const op1 = withPostgresFacilityLock(runtime.tenantDb, tenantId, facilityId, async () => {
      executionOrder.push('op1-start');
      await new Promise((r) => setTimeout(r, 50));
      executionOrder.push('op1-end');
      return 'res1';
    });

    const op2 = withPostgresFacilityLock(runtime.tenantDb, tenantId, facilityId, async () => {
      await Promise.resolve();
      executionOrder.push('op2-start');
      executionOrder.push('op2-end');
      return 'res2';
    });

    const [r1, r2] = await Promise.all([op1, op2]);
    expect(r1).toBe('res1');
    expect(r2).toBe('res2');

    // op1 must completely finish before op2 starts
    expect(executionOrder).toEqual(['op1-start', 'op1-end', 'op2-start', 'op2-end']);
  });

  it('permits concurrent operations across different facilities', async () => {
    const executionOrder: string[] = [];

    const opA = withPostgresFacilityLock(runtime.tenantDb, tenantId, 'facility-A', async () => {
      executionOrder.push('opA-start');
      await new Promise((r) => setTimeout(r, 50));
      executionOrder.push('opA-end');
      return 'A';
    });

    const opB = withPostgresFacilityLock(runtime.tenantDb, tenantId, 'facility-B', async () => {
      await Promise.resolve();
      executionOrder.push('opB-start');
      executionOrder.push('opB-end');
      return 'B';
    });

    await Promise.all([opA, opB]);

    // opB can start while opA is running
    expect(executionOrder[0]).toBe('opA-start');
    expect(executionOrder[1]).toBe('opB-start');
  });

  it('releases lock cleanly if an operation throws', async () => {
    const facilityId = 'facility-fail';

    await expect(
      withPostgresFacilityLock(runtime.tenantDb, tenantId, facilityId, async () => {
        await Promise.resolve();
        throw new Error('boom');
      }),
    ).rejects.toThrow();

    // Subsequent operation must acquire lock without getting stuck
    const res = await withPostgresFacilityLock(runtime.tenantDb, tenantId, facilityId, async () => {
      await Promise.resolve();
      return 'recovered';
    });
    expect(res).toBe('recovered');
  });
});
