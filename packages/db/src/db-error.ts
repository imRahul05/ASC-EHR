import { DrizzleQueryError } from 'drizzle-orm/errors';
import postgres from 'postgres';

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

/**
 * Replaces a driver failure with a `DatabaseError`: a Drizzle query error (its
 * message lists the bound parameters) or a Postgres server error (`DETAIL` holds
 * the failing row). Recognised by class, not by the shape of `code`: Node system
 * errors such as `EPIPE` or `EBUSY` are five characters too. Anything else, such as
 * an error thrown by the caller's own callback or a socket error, passes through unchanged.
 */
export function toSafeDbError(error: unknown): unknown {
  const wrapped = error instanceof DrizzleQueryError;
  const source: unknown = wrapped ? error.cause : error;
  if (source instanceof postgres.PostgresError) return new DatabaseError(source.code, source.constraint_name);
  return wrapped ? new DatabaseError() : error;
}
