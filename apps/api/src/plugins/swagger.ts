import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

interface SwaggerPluginOptions {
  readonly routePrefix?: string | undefined;
}

/**
 * Registers OpenAPI 3.0 specification generator and interactive Swagger UI.
 *
 * For ambulatory surgery centers (ASCs), clear API documentation ensures
 * interoperability partners (e.g. clearinghouses, lab interfaces, EHR integration engines)
 * adhere to standard FHIR and ASC data exchange schemas without leaking PHI.
 */
export async function registerSwagger(app: FastifyInstance, options?: SwaggerPluginOptions): Promise<void> {
  const routePrefix = options?.routePrefix ?? "/docs";

  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "ASC EHR Clinical & Administrative API",
        description:
          "High-concurrency ambulatory surgery center API featuring Medplum FHIR backend, clinical state machines, and multi-tenant isolation.",
        version: "0.1.0",
      },
      servers: [
        {
          url: "/",
          description: "Current environment",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Medplum Bearer token for user/machine identity",
          },
          facilityHeader: {
            type: "apiKey",
            in: "header",
            name: "x-facility-id",
            description: "Tenant facility context header required for facility-scoped operations",
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix,
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
    staticCSP: true,
  });
}
