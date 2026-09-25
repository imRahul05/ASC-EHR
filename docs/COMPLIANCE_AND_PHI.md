# Compliance, HIPAA, SOC 2, and PHI Data Handling

As an EHR (Electronic Health Record) system, handling Protected Health Information (PHI) securely and complying with healthcare and data security regulations is critical. This document outlines the rules AI agents and developers must follow to ensure HIPAA and SOC 2 compliance.

## 1. HIPAA (Health Insurance Portability and Accountability Act)

HIPAA regulates the protection of sensitive patient health information from being disclosed without the patient's consent or knowledge.

### Rules for Agents and Developers:
*   **Data Minimization**: Only process and return the minimum PHI necessary to accomplish the intended task.
*   **Encryption**: Ensure all PHI is encrypted at rest and in transit.
*   **No PHI in Logs**: NEVER include raw, unmasked PHI in console logs, application logs, traces, error messages, or debugging artifacts.
*   **PHI to AI models — BAA providers only**: Clinical AI (scribe, note generation, coding) requires PHI in prompts. This is allowed **only** through the `@asc/agents` gateway with `containsPhi: true`, which restricts routing to providers flagged `baa: true` in the provider catalog and refuses the call if none are available. Never call a model SDK directly, never send PHI to a provider without a signed BAA, and send only the minimum necessary context. Prompts and model outputs are never logged.
*   **Access Control**: Ensure that all endpoints accessing PHI implement strict Authorization checks.

## 2. SOC 2 (Service Organization Control Type 2)

SOC 2 is an auditing procedure that ensures service providers securely manage data to protect the interests of the organization and the privacy of its clients.

### Rules for Agents and Developers:
*   **Auditability**: All actions that read, modify, or delete PHI must be strictly audited.
*   **Change Management**: Code changes must go through a documented review process (PRs, automated tests, compliance checks).
*   **Availability & Security**: Implement rate limiting, monitoring, and alerts to prevent DDoS and ensure system availability and data integrity.

## 3. The 3-Layer Logging and Observability Architecture

**CRITICAL RULE FOR AI AGENTS:** You must strictly follow this architecture whenever you write code involving logging, tracing, or auditing. Do not initialize raw loggers or reinvent these layers.

### Layer 1: Application Logging (`@asc/logger`)
*   **Rule**: NEVER initialize Pino directly in apps or use `console.log` for application events.
*   **Action**: Always use the shared `@asc/logger` package.
*   **Why**: The shared logger is pre-configured with PHI-redaction rules and environment-specific formatting (e.g., `pino-pretty` in dev, structured JSON in prod).
*   **How**: `import { logger } from "@asc/logger";`

### Layer 2: Observability / Telemetry (`@asc/telemetry`)
*   **Rule**: Application telemetry (OpenTelemetry) must remain separate from normal application logging.
*   **Action**: Use `@asc/telemetry` for distributed tracing.
*   **Why**: The custom telemetry processor (`RedactingSpanProcessor`) ensures PHI-redaction rules are applied to all span attributes and metadata before leaving the system.

### Layer 3: Durable Audit Trail (`@asc/audit`)
*   **Rule**: Application logs are NOT the compliance audit trail.
*   **Action**: Use `@asc/audit` to record all security and business events.
*   **Why**: We must track *who* (user, system, agent) did *what*, *when*, and *why* in a durable, queryable format without storing raw PHI.
*   **How**: `import { auditClient } from "@asc/audit";`
*   **Durability**: In development the default store writes a dedicated `channel: "audit"` log stream. In **production the client fails closed**: it throws unless a durable store is injected at startup with `configureAuditStore(store)` (planned: Medplum `AuditEvent`, see the Medplum ADR). `details` accepts primitive values only and rejects PHI-like keys.

## 4. PHI Audit Logging Requirements

Audit logs track security and business actions. 

### Rules for Agents and Developers:
*   **Log Everything**: Every read and write operation involving PHI must generate an audit log entry via `auditClient`.
*   **Do NOT Log the PHI Itself**: The audit log should contain metadata (`patientId`, `actorId`, `action`, `timestamp`, `outcome`, `agentExecutionId`) but MUST NOT contain the actual sensitive data (e.g., do not log "User viewed diagnosis: Cancer", log "User viewed diagnosis for Patient: 12345").
*   **Agent Workflows**: When an AI agent performs an action on behalf of a user or the system, the audit log must reflect both the triggering user and the AI agent involved by providing the `agentExecutionId`.

---
**Summary for AI Agents**: If you need to log something for developers, use `@asc/logger`. If you need to record a business/security event, use `@asc/audit`. Never bypass these packages to reinvent logging directly.
