import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatZodError, isZodError } from "./errors.js";

describe("validation error helpers", () => {
  it("identifies ZodError correctly", () => {
    const schema = z.object({ foo: z.string() });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(isZodError(result.error)).toBe(true);
      const formatted = formatZodError(result.error);
      expect(formatted.code).toBe("invalid_payload");
      expect(formatted.details.foo).toBeDefined();
      expect(formatted.issues).toHaveLength(1);
      expect(formatted.issues?.[0]?.path).toBe("foo");
    }

    expect(isZodError(new Error("generic error"))).toBe(false);
  });
});
