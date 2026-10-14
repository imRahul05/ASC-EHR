-- Day-1 single-facility streamlining (ADR 2026-10-14).
-- Drops session-variable-dependent RLS policies that pin connection pools on Neon / PgBouncer.
-- Preserves tenant_id and facility_id on all tables; queries filter directly by parameters.
DROP POLICY IF EXISTS "tenant_isolation" ON "agent_runs";
--> statement-breakpoint
ALTER TABLE "agent_runs" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_runs" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_read" ON "audit_events";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_append" ON "audit_events";
--> statement-breakpoint
ALTER TABLE "audit_events" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_events" DISABLE ROW LEVEL SECURITY;
