import { describe, expect, it } from "vitest";
import { buildTestApp } from "../testing/test-app.js";

interface OpenApiDocument {
  readonly openapi: string;
  readonly info: {
    readonly title: string;
    readonly version: string;
  };
  readonly paths: Record<string, Record<string, object>>;
  readonly components?: {
    readonly securitySchemes?: Record<string, { readonly type: string }>;
  };
}

describe("OpenAPI / Swagger documentation plugin", () => {
  it("serves OpenAPI 3.0 specification at /docs/json when enabled", async () => {
    const { app } = await buildTestApp({ enableSwagger: true });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/docs/json",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");

      const spec = JSON.parse(response.body) as OpenApiDocument;
      expect(spec.openapi).toMatch(/^3\.0\./);
      expect(spec.info.title).toBe("ASC EHR Clinical & Administrative API");
      expect(spec.info.version).toBe("0.1.0");
      expect(spec.components?.securitySchemes?.bearerAuth?.type).toBe("http");
      expect(spec.components?.securitySchemes?.facilityHeader?.type).toBe("apiKey");
    } finally {
      await app.close();
    }
  });

  it("serves Swagger UI HTML at /docs when enabled", async () => {
    const { app } = await buildTestApp({ enableSwagger: true });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/docs",
      });

      // Fastify Swagger UI either redirects /docs to /docs/ or returns the index HTML
      expect([200, 302]).toContain(response.statusCode);

      const htmlResponse = await app.inject({
        method: "GET",
        url: "/docs/",
      });
      expect(htmlResponse.statusCode).toBe(200);
      expect(htmlResponse.headers["content-type"]).toContain("text/html");
    } finally {
      await app.close();
    }
  });

  it("does not mount documentation routes when disabled", async () => {
    const { app } = await buildTestApp({ enableSwagger: false });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/docs/json",
      });
      // Undeclared path without token yields 401 (security default-deny anti-enumeration), never 200
      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
