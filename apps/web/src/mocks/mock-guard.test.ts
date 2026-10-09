import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isApiMockingEnabled, isProductionBuild, resolveApiMocking } from "@asc/config/public-env";

describe("build-time and runtime mock auth guards", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("resolveApiMocking", () => {
    it("strictly forbids API mocking in production unless NEXT_PUBLIC_API_MOCKING is 'enabled'", () => {
      expect(resolveApiMocking("production", undefined)).toBe(false);
      expect(resolveApiMocking("production", "")).toBe(false);
      expect(resolveApiMocking("production", "disabled")).toBe(false);
      expect(resolveApiMocking("production", "true")).toBe(false);
      expect(resolveApiMocking("production", "1")).toBe(false);
      expect(resolveApiMocking("production", "enabled")).toBe(true);
    });

    it("enables API mocking by default in development unless explicitly disabled", () => {
      expect(resolveApiMocking("development", undefined)).toBe(true);
      expect(resolveApiMocking("development", "")).toBe(true);
      expect(resolveApiMocking("development", "enabled")).toBe(true);
      expect(resolveApiMocking("development", "disabled")).toBe(false);
    });
  });

  describe("isApiMockingEnabled with process.env", () => {
    it("reports disabled in production build when NEXT_PUBLIC_API_MOCKING is not enabled", () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: "production",
        NEXT_PUBLIC_API_MOCKING: undefined,
      };
      expect(isProductionBuild()).toBe(true);
      expect(isApiMockingEnabled()).toBe(false);
    });

    it("reports disabled in production build when NEXT_PUBLIC_API_MOCKING is set to disabled", () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: "production",
        NEXT_PUBLIC_API_MOCKING: "disabled",
      };
      expect(isProductionBuild()).toBe(true);
      expect(isApiMockingEnabled()).toBe(false);
    });

    it("only activates in production build when NEXT_PUBLIC_API_MOCKING is explicitly enabled", () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: "production",
        NEXT_PUBLIC_API_MOCKING: "enabled",
      };
      expect(isProductionBuild()).toBe(true);
      expect(isApiMockingEnabled()).toBe(true);
    });
  });
});
