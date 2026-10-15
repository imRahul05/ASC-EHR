import { describe, expect, it } from "vitest";
import { API_ERROR_CODES, API_ERROR_REGISTRY, type ApiErrorCode } from "./errors.js";

describe("API_ERROR_CODES and API_ERROR_REGISTRY", () => {
  it("defines standard error codes with expected string literals", () => {
    expect(API_ERROR_CODES.INVALID_PAYLOAD).toBe("invalid_payload");
    expect(API_ERROR_CODES.FACILITY_REQUIRED).toBe("facility_required");
    expect(API_ERROR_CODES.INVALID_CASE_ID).toBe("invalid_case_id");
    expect(API_ERROR_CODES.NOT_FOUND).toBe("not_found");
    expect(API_ERROR_CODES.GATE_FAILED).toBe("GATE_FAILED");
    expect(API_ERROR_CODES.CONFLICT).toBe("conflict");
    expect(API_ERROR_CODES.FORBIDDEN).toBe("forbidden");
    expect(API_ERROR_CODES.UNAUTHENTICATED).toBe("unauthenticated");
  });

  it("contains registry entries for every defined error code with valid HTTP status", () => {
    const codes = Object.values(API_ERROR_CODES) as readonly ApiErrorCode[];
    for (const code of codes) {
      const def = API_ERROR_REGISTRY[code];
      expect(def, `Missing registry definition for code: ${code}`).toBeDefined();
      expect(typeof def.status).toBe("number");
      expect(def.status >= 400 && def.status <= 599).toBe(true);
      expect(typeof def.defaultMessage).toBe("string");
      expect(def.defaultMessage.length).toBeGreaterThan(0);
    }
  });

  it("maps status codes accurately", () => {
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.INVALID_PAYLOAD].status).toBe(400);
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.FACILITY_REQUIRED].status).toBe(400);
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.UNAUTHENTICATED].status).toBe(401);
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.FORBIDDEN].status).toBe(403);
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.NOT_FOUND].status).toBe(404);
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.GATE_FAILED].status).toBe(409);
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.INTERNAL_ERROR].status).toBe(500);
  });
});
