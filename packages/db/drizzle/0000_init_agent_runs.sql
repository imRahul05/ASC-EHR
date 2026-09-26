CREATE TABLE "agent_runs" (
	"execution_id" text PRIMARY KEY NOT NULL,
	"agent" text NOT NULL,
	"prompt_version" text NOT NULL,
	"status" text NOT NULL,
	"claim" integer NOT NULL,
	"contains_phi" boolean NOT NULL,
	"org_id" text,
	"patient_id" text,
	"surgical_case_id" text,
	"context_manifest" jsonb,
	"output" jsonb,
	"meta" jsonb,
	"failure_kind" text,
	"error_name" text,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "agent_runs_status_check" CHECK ("agent_runs"."status" IN ('running', 'succeeded', 'failed')),
	CONSTRAINT "agent_runs_claim_check" CHECK ("agent_runs"."claim" >= 1)
);
--> statement-breakpoint
CREATE INDEX "agent_runs_status_started_at_idx" ON "agent_runs" USING btree ("status","started_at");