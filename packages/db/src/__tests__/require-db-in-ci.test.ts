/**
 * The DB suites skip without TEST_DATABASE_URL so `pnpm test` stays green on a
 * laptop without Docker. In CI that would hide the RLS and isolation tests, so
 * CI must provide a database: this test fails when CI is set and it is not.
 */

import { describe, expect, it } from 'vitest';

describe('database tests in CI', () => {
  it('runs against a database when CI is set', () => {
    if (!process.env.CI) return;
    expect(process.env.TEST_DATABASE_URL, 'CI must set TEST_DATABASE_URL, or the RLS tests are silently skipped').toBeTruthy();
  });
});
