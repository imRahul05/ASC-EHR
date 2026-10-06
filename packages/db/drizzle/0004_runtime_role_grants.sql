-- Owner and runtime are different roles. Migrations run as the table owner;
-- the app connects as a login role that is a member of asc_runtime (local:
-- asc_app, see docker/postgres/init; deployed: created by infra). asc_runtime
-- owns nothing, cannot alter tables, and cannot bypass row-level security.
-- Grants are explicit per table (no default privileges): least privilege.
DO $$
BEGIN
	BEGIN
		CREATE ROLE asc_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
	EXCEPTION WHEN duplicate_object THEN
		NULL; -- already exists (or created by a concurrent migration)
	END;
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asc_runtime' AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolcanlogin)) THEN
		RAISE EXCEPTION 'role asc_runtime must be NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB';
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	EXECUTE format('GRANT USAGE ON SCHEMA %I TO asc_runtime', current_schema());
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "agent_runs" TO asc_runtime;
