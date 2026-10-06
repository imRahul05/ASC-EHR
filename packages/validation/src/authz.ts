import { z } from "zod";
import { CAPABILITY_CATALOG } from "@asc/types/capability";
import type { Capability } from "@asc/types/capability";

// Authorization contracts: Principal, role templates and GET /me (08 §6, §7).

const capabilityKeys = CAPABILITY_CATALOG.map((entry) => entry.key) as [Capability, ...Capability[]];

export const capabilitySchema = z.enum(capabilityKeys);

export const roleKeySchema = z.string().min(1);

export const tenantRefSchema = z.object({
  tenantId: z.string().min(1),
  medplumProjectId: z.string().min(1),
});

const grantShape = {
  roleKeys: z.array(roleKeySchema),
  capabilities: z.array(capabilitySchema),
};

export const grantSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("all"), ...grantShape }),
  z.object({ scope: z.literal("facility"), facilityId: z.string().min(1), ...grantShape }),
]);

const principalBase = {
  id: z.string().min(1),
  tenant: tenantRefSchema,
  grants: z.array(grantSchema),
};

export const principalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("staff"), membershipId: z.string().min(1), ...principalBase }),
  z.object({ kind: z.literal("patient"), patientId: z.string().min(1), ...principalBase }),
  z.object({ kind: z.literal("service"), clientId: z.string().min(1), ...principalBase }),
  z.object({
    kind: z.literal("agent"),
    agentId: z.string().min(1),
    executionId: z.string().min(1),
    onBehalfOf: z.string().min(1),
    run: z.object({ patientId: z.string().min(1), caseId: z.string().min(1).optional() }),
    ...principalBase,
  }),
]);

export const resourceRuleSchema = z.object({
  resourceType: z.string().min(1),
  readonly: z.boolean().optional(),
  hiddenFields: z.array(z.string()).optional(),
  readonlyFields: z.array(z.string()).optional(),
  lockWhenFinal: z.boolean().optional(),
  shared: z.boolean().optional(),
});

export const roleTemplateSchema = z.object({
  key: roleKeySchema,
  version: z.number().int().positive(),
  label: z.string().min(1),
  status: z.enum(["active", "deprecated", "retired"]),
  capabilities: z.array(capabilitySchema),
  data: z.array(resourceRuleSchema),
  facilityScoped: z.boolean(),
  requiresMfa: z.boolean(),
});

// GET /me
export const facilityRefSchema = z.object({ id: z.string().min(1), name: z.string().min(1) });

// The principal plus display names for the facilities its grants name (facility switcher).
export const meResponseSchema = z.object({
  principal: principalSchema,
  facilities: z.array(facilityRefSchema),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
