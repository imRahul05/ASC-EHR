import { StaticTenantResolver } from "@asc/authz";
import { apiEnvSchema, isProductionEnv, parseEnv, resolveCorsOrigins, resolveTenantRef } from "@asc/config";
import { createTenantDb } from "@asc/db";
import { logger } from "@asc/logger";
import { shutdownTelemetry } from "@asc/telemetry";
import { buildApp } from "./app.js";
import { buildAuditClient } from "./audit-setup.js";
import { createIdentityPort } from "./identity/select.js";

async function start(): Promise<void> {
  const env = parseEnv(apiEnvSchema);
  // Phase 1: the one configured tenant (names missing variables, never values).
  const tenant = resolveTenantRef(env);

  const production = isProductionEnv();
  // A real identity provider is mandatory in production and staging (the dev fake is refused).
  const identity = createIdentityPort({ production, tenant, medplumBaseUrl: env.MEDPLUM_BASE_URL });

  // Runtime role only (never the owner URL): tenant-scoped, cannot alter tables or bypass RLS.
  const database = env.DATABASE_RUNTIME_URL === undefined ? undefined : createTenantDb({ url: env.DATABASE_RUNTIME_URL });
  // Production without a durable, append-only audit store stops here.
  const audit = buildAuditClient({
    production,
    ...(database === undefined ? {} : { tenantDb: database }),
    defaultTenantId: tenant.tenantId,
  });

  const app = await buildApp({
    corsOrigins: resolveCorsOrigins(env),
    rateLimit: {
      ipMax: env.RATE_LIMIT_IP_MAX,
      userMax: env.RATE_LIMIT_USER_MAX,
      windowMs: env.RATE_LIMIT_WINDOW_MS,
    },
    tenantResolver: new StaticTenantResolver(tenant),
    identity,
    audit,
    catalogVersion: env.GIT_SHA ?? "unknown",
    production,
    medplumBaseUrl: env.MEDPLUM_BASE_URL,
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "Shutting down API");
    await app.close();
    await database?.close();
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
