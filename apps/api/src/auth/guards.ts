import { authorize } from "@asc/authz";
import type { DenyReason } from "@asc/authz";
import type { AuthDeniedReason } from "@asc/audit";
import type { Capability } from "@asc/types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import "./augment.js";
import type { createDenier } from "./denied.js";

/** Facility ids are opaque ids. Anything else (a path or query value an attacker shaped) is not a facility. */
const FACILITY_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** `@asc/authz` deny reasons as audit reasons. Exhaustive over `DenyReason`. */
const AUDIT_REASON = {
  "no-grant-at-facility": "wrong-facility",
  "capability-not-granted": "missing-capability",
  "outside-run-scope": "policy-denied",
  "patient-capability-not-portal": "policy-denied",
} as const satisfies Record<DenyReason, AuthDeniedReason>;

export function createGuards(deny: ReturnType<typeof createDenier>) {
  return {
    /**
     * Gates 3 and 4 at a facility. Without a (well-formed) facility id only all-site
     * grants count. Returns false after sending the denial (and auditing it with its
     * gate); the caller must then stop: `if (!(await ...)) return reply;`.
     */
    async requireCapabilityAt(
      request: FastifyRequest,
      reply: FastifyReply,
      capability: Capability,
      facilityId: string | undefined,
    ): Promise<boolean> {
      const principal = request.principal;
      if (principal === undefined) {
        await deny(request, reply, { status: 401, gate: 2, reason: "invalid-token" });
        return false;
      }
      const target = facilityId !== undefined && FACILITY_ID.test(facilityId) ? facilityId : undefined;
      const decision = authorize(principal, capability, target === undefined ? {} : { facilityId: target });
      request.facilityChecked = true;
      if (decision.allowed) return true;
      await deny(request, reply, {
        status: 403,
        gate: decision.gate,
        reason: AUDIT_REASON[decision.reason],
        capability,
        ...(target === undefined ? {} : { facilityId: target }),
      });
      return false;
    },

    /**
     * A resource owned by another tenant is "not found", never data. Returns false after
     * sending the 404; the caller must stop.
     */
    async requireSameTenant(request: FastifyRequest, reply: FastifyReply, ownerTenantId: string): Promise<boolean> {
      if (request.tenant?.tenantId === ownerTenantId) return true;
      await deny(request, reply, { status: 404, gate: 1, reason: "policy-denied" });
      return false;
    },
  };
}

/**
 * Gates 3 and 4 for routes that declare a capability. A facility named by a route
 * parameter is checked here, before the handler. A facility that belongs to a loaded
 * resource is checked by the handler through `app.guards`; `onSend` turns a success
 * that skipped the check into a 500 (fail closed).
 */
export function registerAuthorization(app: FastifyInstance, guards: ReturnType<typeof createGuards>): void {
  app.decorate("guards", guards);

  app.addHook("onRequest", async (request, reply) => {
    const auth = request.routeOptions.config.auth;
    if (auth?.mode !== "capability") return undefined;
    const principal = request.principal;
    if (principal === undefined) return reply; // authentication already answered

    if (auth.facility.from === "param") {
      const raw = (request.params as Record<string, unknown> | undefined)?.[auth.facility.name];
      const allowed = await guards.requireCapabilityAt(request, reply, auth.capability, typeof raw === "string" ? raw : undefined);
      return allowed ? undefined : reply;
    }
    if (auth.facility.from === "none") {
      const allowed = await guards.requireCapabilityAt(request, reply, auth.capability, undefined);
      return allowed ? undefined : reply;
    }
    // from "resource": coarse check now (the capability must exist somewhere); the handler checks the facility.
    if (principal.grants.some((grant) => grant.capabilities.includes(auth.capability))) {
      request.facilityChecked = false;
      return undefined;
    }
    const allowed = await guards.requireCapabilityAt(request, reply, auth.capability, undefined);
    return allowed ? undefined : reply;
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const auth = request.routeOptions.config.auth;
    if (auth?.mode === "capability" && auth.facility.from === "resource" && request.facilityChecked === false && reply.statusCode < 400) {
      request.log.error({ route: request.routeOptions.url }, "handler answered a resource route without requireCapabilityAt");
      reply.code(500).type("application/json");
      return JSON.stringify({ code: "internal_error", message: "Internal error." });
    }
    return payload;
  });
}
