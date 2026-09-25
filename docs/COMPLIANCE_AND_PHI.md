# Compliance, HIPAA, SOC 2, and PHI Data Handling

As an EHR (Electronic Health Record) system, handling Protected Health Information (PHI) securely and complying with healthcare and data security regulations is critical. This document outlines the rules AI agents and developers must follow to ensure HIPAA and SOC 2 compliance.

## 1. HIPAA (Health Insurance Portability and Accountability Act)

HIPAA regulates the protection of sensitive patient health information from being disclosed without the patient's consent or knowledge.

### Rules for Agents and Developers:
*   **Data Minimization**: Only process and return the minimum PHI necessary to accomplish the intended task.
*   **Encryption**: Ensure all PHI is encrypted at rest and in transit.
*   **No PHI in Prompts/Logs**: NEVER include raw, unmasked PHI in AI prompt payloads, console logs, error messages, or debugging artifacts.
*   **Access Control**: Ensure that all endpoints accessing PHI implement strict Authorization checks.

## 2. SOC 2 (Service Organization Control Type 2)

SOC 2 is an auditing procedure that ensures service providers securely manage data to protect the interests of the organization and the privacy of its clients.

### Rules for Agents and Developers:
*   **Auditability**: All actions that read, modify, or delete PHI must be strictly audited.
*   **Change Management**: Code changes must go through a documented review process (PRs, automated tests, compliance checks).
*   **Availability & Security**: Implement rate limiting, monitoring, and alerts to prevent DDoS and ensure system availability and data integrity.

## 3. PHI Audit Logging Requirements

Audit logs are required to track *who* accessed *what* data, *when*, and *why*.

### Rules for Agents and Developers:
*   **Log Everything**: Every read and write operation involving PHI must generate an audit log entry.
*   **Do NOT Log the PHI Itself**: The audit log should contain metadata (e.g., Patient ID, User ID, Action Type, Timestamp, IP Address) but MUST NOT contain the actual sensitive data (e.g., do not log "User viewed diagnosis: Cancer", log "User viewed diagnosis for Patient: 12345").
*   **Immutable Logs**: Audit logs must be tamper-proof or written to an append-only store.
*   **Agent Workflows**: When an AI agent performs an action on behalf of a user or the system, the audit log must reflect both the triggering user and the AI agent involved.

---
**Summary for AI Agents**: If you are writing logging logic, error handling, or external API calls, you must aggressively redact PHI. If you are modifying the database or an API route, ensure it emits an audit trail event without exposing the underlying patient data.
