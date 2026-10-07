import { iamEvent } from "@asc/audit";
import type { AuditClient, AuditDecision, AuditGate, AuthDeniedReason } from "@asc/audit";
import { roleRegistry } from "@asc/authz";
import type { FastifyReply, FastifyRequest } from "fastify";

import "./augment.js";

const CODES = {
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  503: "unavailable",
} as const;

// Generic on purpose: the body never says which gate or why.
const MESSAGES = {
  401: "Authentication required.",
  403: "You do not have access to this resource.",
  404: "Not found.",
  503: "Service temporarily unavailable.",
} as const;

/** Decision provenance for a signed-in caller: role template versions (`rn-v3`), build id, cache state. */
function decisionFor(request: FastifyRequest, catalogVersion: string): AuditDecision | undefined {
  const principal = request.principal;
  if (principal === undefined) return undefined;
  const roleKeys = [...new Set(principal.grants.flatMap((grant) => grant.roleKeys))];
  const roleVersions = roleKeys.flatMap((key) => {
    const template = roleRegistry.get(key);
    return template === undefined ? [] : [`${key}-v${template.version}`];
  });
  return { roleVersions, catalogVersion, cache: request.identityCache ?? "miss" };
}

/**
 * Builds the single place that refuses a request. A denial is audited with its
 * gate number and answered with a generic body.
 *
 * Audit write failure policy (P05f decision 10): the denial is never skipped. If
 * the audit write fails, the failure is logged by error name only (no payload) and
 * the caller still gets the 4xx. Gate failures that are not decisions (503, the
 * identity provider is down) are logged, not audited.
 */
export function createDenier(options: { audit: Pick<AuditClient, "logEvent">; catalogVersion: string }) {
  return async function deny(
    request: FastifyRequest,
    reply: FastifyReply,
    info: {
      status: 401 | 403 | 404 | 503;
      gate?: AuditGate;
      reason?: AuthDeniedReason;
      capability?: string;
      facilityId?: string;
    },
  ): Promise<FastifyReply> {
    if (info.gate !== undefined && info.reason !== undefined) {
      const principal = request.principal;
      const decision = decisionFor(request, options.catalogVersion);
      try {
        await options.audit.logEvent(
          iamEvent(
            "auth.denied",
            {
              actorType: "user",
              actorId: principal?.id ?? "anonymous",
              ...(principal?.kind === "staff" ? { membershipId: principal.membershipId } : {}),
              ...(request.tenant === undefined ? {} : { tenantId: request.tenant.tenantId }),
              ...(info.facilityId === undefined ? {} : { facilityId: info.facilityId }),
              requestId: request.id,
              clientIp: request.ip,
              ...(typeof request.headers["user-agent"] === "string" ? { userAgent: request.headers["user-agent"] } : {}),
              ...(decision === undefined ? {} : { decision }),
              gate: info.gate,
            },
            { reason: info.reason, ...(info.capability === undefined ? {} : { capability: info.capability }) },
          ),
        );
      } catch (error) {
        request.log.error({ errorName: error instanceof Error ? error.name : "unknown" }, "audit write failed for a denied request");
      }
    } else {
      request.log.warn({ status: info.status }, "request refused without an audit decision");
    }
    return reply.code(info.status).send({ code: CODES[info.status], message: MESSAGES[info.status] });
  };
}
