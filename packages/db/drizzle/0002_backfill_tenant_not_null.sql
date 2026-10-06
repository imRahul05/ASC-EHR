-- Contract step of expand -> migrate -> contract. Hand-edited before it was ever applied.
-- Backfills rows written before tenancy with the configured tenant, passed as the
-- session setting app.default_tenant_id (DEFAULT_TENANT_ID). Fails closed: if rows
-- without a tenant remain, the migration stops instead of guessing.
DO $$
DECLARE
	default_tenant uuid := nullif(current_setting('app.default_tenant_id', true), '')::uuid;
BEGIN
	IF default_tenant IS NOT NULL THEN
		UPDATE "agent_runs" SET "tenant_id" = default_tenant WHERE "tenant_id" IS NULL;
	END IF;
	IF EXISTS (SELECT 1 FROM "agent_runs" WHERE "tenant_id" IS NULL) THEN
		RAISE EXCEPTION 'agent_runs has rows without tenant_id: set app.default_tenant_id to the configured tenant and re-run the migration';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "tenant_id" SET NOT NULL;
