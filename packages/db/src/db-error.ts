import { DrizzleQueryError } from 'drizzle-orm/errors';

/**
 * A database failure that is safe to log, return or audit: SQLSTATE and
 * constraint name only. Drizzle's own error message lists every bound
 * parameter (`params: …`), and Postgres puts the failing row in `DETAIL`; for
 * `agent_runs` that includes model output (PHI) and for `audit_events` the
 * event details. Neither is kept.
 */
export class DatabaseError extends Error {
  constructor(
    readonly sqlState?: string,
    readonly constraint?: string,
  ) {
    super(
      `Database operation failed${sqlState ? ` (SQLSTATE ${sqlState})` : ''}${constraint ? ` [${constraint}]` : ''}`,
    );
    this.name = 'DatabaseError';
  }
}

const SQLSTATE = /^[0-9A-Z]{5}$/;

function field(source: unknown, name: string): string | undefined {
  if (typeof source !== 'object' || source === null || !(name in source)) return undefined;
  const value = (source as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Replaces a driver failure (a Drizzle query error or a Postgres error with a
 * SQLSTATE) with a `DatabaseError`. Anything else, such as an error thrown by
 * the caller's own callback, passes through unchanged.
 */
export function toSafeDbError(error: unknown): unknown {
  const wrapped = error instanceof DrizzleQueryError;
  const source: unknown = wrapped ? error.cause : error;
  const code = field(source, 'code');
  if (code !== undefined && SQLSTATE.test(code)) return new DatabaseError(code, field(source, 'constraint_name'));
  return wrapped ? new DatabaseError() : error;
}
