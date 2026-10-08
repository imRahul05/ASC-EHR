/**
 * Medplum server settings whose defaults are unsafe for PHI. Every environment's config must
 * carry them (P05h; P06 reuses this check for the Azure config).
 */
export const REQUIRED_HARDENING = {
  /** Default true opens /auth/newuser and /auth/newproject to anyone. */
  registerEnabled: false,
  /** Default false stores no AuditEvent rows. */
  saveAuditEvents: true,
  /** Default true writes bot inputs (PHI) to blob storage. */
  storeBotInput: false,
} as const;

/** One message per setting that is missing or has the wrong value. Never includes other values. */
export function findHardeningViolations(config: unknown): string[] {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return ["config is not a JSON object"];
  }
  const violations: string[] = [];
  for (const [key, expected] of Object.entries(REQUIRED_HARDENING)) {
    const actual: unknown = Object.hasOwn(config, key) ? Reflect.get(config, key) : undefined;
    if (actual !== expected) {
      violations.push(`${key} must be explicitly ${String(expected)}`);
    }
  }
  return violations;
}
