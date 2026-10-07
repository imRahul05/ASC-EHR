import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/** Security headers (helmet defaults: HSTS, nosniff, frame and referrer policy, no `X-Powered-By`). */
export async function registerSecurityHeaders(app: FastifyInstance): Promise<void> {
  await app.register(helmet);
}

/** The one 429 body: generic, never echoes the limit key (it can contain an address). */
export function tooManyRequests(reply: FastifyReply, retryAfterSeconds: number): FastifyReply {
  return reply
    .code(429)
    .header("retry-after", String(retryAfterSeconds))
    .send({ code: "rate_limited", message: `Too many requests. Retry in ${retryAfterSeconds} seconds.` });
}

/**
 * Flood limit in front of authentication, so a flood of bad tokens is stopped before it
 * reaches the identity provider. The key must not depend on who the caller is.
 *
 * It is an explicit `onRequest` hook, not the plugin's own route hook: the plugin adds its
 * hook to each route, which runs after the global hooks (including authentication), so
 * failed authentications would never be counted. `app.createRateLimit` (added by the
 * plugin) also serves the per-user check once the caller is known.
 */
export async function registerRateLimit(
  app: FastifyInstance,
  options: { max: number; windowMs: number; key: (request: FastifyRequest) => string },
): Promise<void> {
  await app.register(rateLimit, { global: false });
  const check = app.createRateLimit({ max: options.max, timeWindow: options.windowMs, keyGenerator: options.key });
  app.addHook("onRequest", async (request, reply) => {
    const limit = await check(request);
    // `isAllowed: true` means the key is allow-listed (not counted); otherwise check the budget.
    if (!limit.isAllowed && limit.isExceeded) return tooManyRequests(reply, limit.ttlInSeconds);
    return undefined;
  });
}
