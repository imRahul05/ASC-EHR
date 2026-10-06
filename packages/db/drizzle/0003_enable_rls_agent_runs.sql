-- Tenant isolation (08 §4.4). FORCE applies the policy to the table owner too.
-- Fail closed: when app.tenant_id is unset or empty the policy expression is NULL,
-- so reads return no rows and inserts/updates are rejected. Every request or job
-- sets it per transaction: SELECT set_config('app.tenant_id', $1, true).
ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "agent_runs" AS PERMISSIVE FOR ALL
	USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
	WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
