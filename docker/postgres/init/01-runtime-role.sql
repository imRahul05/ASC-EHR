-- Local development only: the app's runtime login. Idempotent.
--   New volume: Docker runs this automatically (docker-entrypoint-initdb.d).
--   Existing volume: docker compose exec -T postgres psql -U asc -d asc_ehr < docker/postgres/init/01-runtime-role.sql
-- The owner (asc) runs migrations; the app connects as asc_app, which is not the
-- table owner and cannot bypass row-level security. Dev-only password, never reuse it.
-- Deployed environments create an equivalent login via infra (P06).
DO $$
BEGIN
	BEGIN
		CREATE ROLE asc_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
	EXCEPTION WHEN duplicate_object THEN
		NULL;
	END;
	BEGIN
		CREATE ROLE asc_app LOGIN PASSWORD 'asc_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE asc_runtime;
	EXCEPTION WHEN duplicate_object THEN
		NULL;
	END;
END $$;
