-- Append-only audit trail with tenant isolation (08 §4.4, §12.3). Same pattern as agent_runs:
-- tenant_id NOT NULL, row-level security enabled AND forced, explicit grants. Plus append-only:
--   1. the runtime role gets SELECT and INSERT only (no UPDATE, DELETE, TRUNCATE);
--   2. no UPDATE or DELETE policy exists, so RLS denies them too;
--   3. triggers reject UPDATE, DELETE and TRUNCATE for everyone, including the owner (mistakes).
-- An owner can still drop a trigger on purpose; that needs a deliberate DDL change that shows in review.
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_read" ON "audit_events" AS PERMISSIVE FOR SELECT
	USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_append" ON "audit_events" AS PERMISSIVE FOR INSERT
	WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "audit_events" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "audit_events" TO asc_runtime;
--> statement-breakpoint
CREATE FUNCTION "audit_events_reject_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'audit_events is append-only: % is not allowed', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_events_no_update_delete" BEFORE UPDATE OR DELETE ON "audit_events"
	FOR EACH ROW EXECUTE FUNCTION "audit_events_reject_change"();
--> statement-breakpoint
CREATE TRIGGER "audit_events_no_truncate" BEFORE TRUNCATE ON "audit_events"
	FOR EACH STATEMENT EXECUTE FUNCTION "audit_events_reject_change"();
