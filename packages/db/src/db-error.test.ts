import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it } from 'vitest';

import { DatabaseError, toSafeDbError } from './db-error.js';

function pgError(code: string, constraint?: string): Error {
  return Object.assign(new Error('new row violates check constraint; Failing row contains (CANARY-ROW)'), {
    code,
    constraint_name: constraint,
    detail: 'Failing row contains (CANARY-DETAIL)',
  });
}

describe('toSafeDbError', () => {
  it('replaces a Drizzle query error with SQLSTATE and constraint, dropping params and detail', () => {
    const wrapped = new DrizzleQueryError('insert into t values ($1)', ['CANARY-PARAM'], pgError('23514', 'audit_events_gate_check'));
    const safe = toSafeDbError(wrapped);
    expect(safe).toBeInstanceOf(DatabaseError);
    expect(safe).toMatchObject({ sqlState: '23514', constraint: 'audit_events_gate_check' });
    const text = JSON.stringify({ message: (safe as Error).message, own: Object.entries(safe as object) });
    expect(text).toContain('23514');
    expect(text).not.toContain('CANARY');
    expect(wrapped.message).toContain('CANARY-PARAM'); // the raw error does leak: that is why it is replaced
  });

  it('replaces a bare Postgres error that has a SQLSTATE', () => {
    expect(toSafeDbError(pgError('42501'))).toMatchObject({ name: 'DatabaseError', sqlState: '42501' });
  });

  it('replaces a Drizzle query error without a code by a generic DatabaseError', () => {
    const safe = toSafeDbError(new DrizzleQueryError('select 1', ['CANARY-PARAM'], new Error('connection reset CANARY')));
    expect(safe).toBeInstanceOf(DatabaseError);
    expect((safe as Error).message).toBe('Database operation failed');
  });

  it('passes through errors that are not driver failures', () => {
    const own = new Error('boom');
    expect(toSafeDbError(own)).toBe(own);
    const network = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    expect(toSafeDbError(network)).toBe(network);
    expect(toSafeDbError('string')).toBe('string');
  });
});
