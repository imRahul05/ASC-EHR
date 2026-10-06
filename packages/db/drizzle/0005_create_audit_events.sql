CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"facility_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"membership_id" text,
	"session_id" text,
	"outcome" text NOT NULL,
	"gate" smallint,
	"organization_id" text,
	"patient_id" text,
	"surgical_case_id" text,
	"resource_type" text,
	"resource_id" text,
	"agent_execution_id" text,
	"request_id" text,
	"correlation_id" text,
	"client_ip_prefix" text,
	"user_agent" text,
	"decision" jsonb,
	"details" jsonb,
	"details_redacted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "audit_events_actor_type_check" CHECK ("audit_events"."actor_type" IN ('user', 'system', 'agent', 'worker', 'bot', 'service')),
	CONSTRAINT "audit_events_outcome_check" CHECK ("audit_events"."outcome" IN ('SUCCESS', 'FAILURE', 'DENIED')),
	CONSTRAINT "audit_events_gate_check" CHECK ("audit_events"."gate" IS NULL OR "audit_events"."gate" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX "audit_events_tenant_occurred_at_idx" ON "audit_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_patient_idx" ON "audit_events" USING btree ("tenant_id","patient_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_actor_idx" ON "audit_events" USING btree ("tenant_id","actor_id","occurred_at");