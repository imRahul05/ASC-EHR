export type ActorType = "user" | "system" | "agent";
export type Outcome = "SUCCESS" | "FAILURE" | "DENIED";

export interface AuditEvent {
  action: string;
  actorType: ActorType;
  actorId: string;
  organizationId?: string;
  patientId?: string;
  surgicalCaseId?: string;
  resourceType?: string;
  resourceId?: string;
  agentExecutionId?: string;
  requestId?: string;
  correlationId?: string;
  outcome: Outcome;
  timestamp: string; // ISO 8601
  details?: Record<string, unknown>; // Safe metadata only, NO PHI
}

/**
 * Abstract interface for storing audit events.
 * The underlying storage can change later (e.g., PostgreSQL, distinct compliance database).
 */
export interface AuditStore {
  save(event: AuditEvent): Promise<void>;
}

export class ConsoleAuditStore implements AuditStore {
  async save(event: AuditEvent): Promise<void> {
    // In local development, we might just print audit events separately.
    // In a real implementation, this would insert into a database.
    console.log("[AUDIT TRAIL]", JSON.stringify(event));
  }
}

export class AuditClient {
  constructor(private store: AuditStore) {}

  async logEvent(event: Omit<AuditEvent, "timestamp">): Promise<void> {
    const fullEvent: AuditEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    
    // In the future: Medplum, RBAC, tenancy verification goes here if needed before saving.
    await this.store.save(fullEvent);
  }
}

// Export a default client with a console store (to be replaced with a DB store later)
export const auditClient = new AuditClient(new ConsoleAuditStore());
