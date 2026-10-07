import type { FastifyInstance } from "fastify";

import "./augment.js";

/**
 * Default deny. Every route must declare what it requires (`config: publicRoute()`,
 * `authenticatedRoute()` or `capabilityRoute(...)`). A route without a declaration
 * makes registration throw, so the app fails to start instead of serving an
 * unprotected route. Register this before any route or plugin that adds routes.
 *
 * Every accepted route is also recorded and exposed as `app.routeAuthInventory()`, so a
 * test can state exactly which routes are public.
 *
 * The single exception is the CORS preflight route `OPTIONS *` that `@fastify/cors`
 * adds itself: a preflight never carries credentials, so it is declared public here.
 */
export function registerDefaultDeny(app: FastifyInstance): void {
  const inventory: ReturnType<FastifyInstance["routeAuthInventory"]> = [];
  app.decorate("routeAuthInventory", () => [...inventory]);

  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (route.method === "OPTIONS" && route.url === "*") {
      route.config = { ...route.config, auth: { mode: "public" } };
    }
    const auth = route.config?.auth;
    if (auth === undefined) {
      throw new Error(
        `Route ${methods.join(",")} ${route.url} declares no auth. Add config: publicRoute(), authenticatedRoute() or capabilityRoute(...).`,
      );
    }
    for (const method of methods) inventory.push({ method, url: route.url, auth });
  });
}
