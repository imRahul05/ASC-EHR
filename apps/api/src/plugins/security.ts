import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";

/** Security headers (helmet defaults: HSTS, nosniff, frame and referrer policy, no `X-Powered-By`). */
export async function registerSecurityHeaders(app: FastifyInstance): Promise<void> {
  await app.register(helmet);
}

/**
 * Global rate limit on `onRequest`, in front of authentication, so a flood of bad
 * tokens is stopped before it reaches the identity provider. Its key must not
 * depend on who the caller is. `app.createRateLimit` (added by the plugin) lets a
 * later gate run a second, per-user check once the caller is known.
 */
export async function registerRateLimit(
  app: FastifyInstance,
  options: { max: number; windowMs: number; key: (request: FastifyRequest) => string },
): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    hook: "onRequest",
    max: options.max,
    timeWindow: options.windowMs,
    keyGenerator: options.key,
    // Generic body: never echo the key (it can contain an address).
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      code: "rate_limited",
      message: `Too many requests. Retry in ${Math.ceil(context.ttl / 1000)} seconds.`,
    }),
  });
}
