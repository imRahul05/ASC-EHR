import type { FastifyInstance } from "fastify";

import "./augment.js";

/**
 * Default deny. Every route must declare what it requires (`config: publicRoute()`,
 * `authenticatedRoute()` or `capabilityRoute(...)`). A route without a declaration
 * makes registration throw, so the app fails to start instead of serving an
 * unprotected route. Register this before any route or plugin that adds routes.
 *
 * The single exception is the CORS preflight route `OPTIONS *` that `@fastify/cors`
 * adds itself: a preflight never carries credentials, so it is declared public here.
 */
export function registerDefaultDeny(app: FastifyInstance): void {
  app.addHook("onRoute", (route) => {
    if (route.method === "OPTIONS" && route.url === "*") {
      route.config = { ...route.config, auth: { mode: "public" } };
      return;
    }
    if (route.config?.auth === undefined) {
      const methods = Array.isArray(route.method) ? route.method.join(",") : route.method;
      throw new Error(
        `Route ${methods} ${route.url} declares no auth. Add config: publicRoute(), authenticatedRoute() or capabilityRoute(...).`,
      );
    }
  });
}
