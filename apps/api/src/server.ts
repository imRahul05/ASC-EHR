import { auditClient } from "@asc/audit";
import { StaticTenantResolver } from "@asc/authz";
import { apiEnvSchema, parseEnv, resolveCorsOrigins, resolveTenantRef } from "@asc/config";
import { logger } from "@asc/logger";
import { shutdownTelemetry } from "@asc/telemetry";
import { buildApp } from "./app.js";

async function start(): Promise<void> {
  const env = parseEnv(apiEnvSchema);
  const app = await buildApp({
    corsOrigins: resolveCorsOrigins(env),
    rateLimit: { ipMax: env.RATE_LIMIT_IP_MAX, windowMs: env.RATE_LIMIT_WINDOW_MS },
    // Phase 1: the one configured tenant (names missing variables, never values).
    tenantResolver: new StaticTenantResolver(resolveTenantRef(env)),
    audit: auditClient,
    catalogVersion: env.GIT_SHA ?? "unknown",
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "Shutting down API");
    await app.close();
    const telemetryError = await shutdownTelemetry();
    if (telemetryError) {
      app.log.error({ err: telemetryError }, "Telemetry shutdown failed");
    }
    process.exit(0);
  };
  process.once("SIGINT", (signal) => void shutdown(signal));
  process.once("SIGTERM", (signal) => void shutdown(signal));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error({ err }, "Failed to start server");
    process.exit(1);
  }
}

start().catch((err: unknown) => {
  // Env validation errors list variable names only, never values.
  logger.fatal({ err }, "API failed to start");
  process.exit(1);
});
