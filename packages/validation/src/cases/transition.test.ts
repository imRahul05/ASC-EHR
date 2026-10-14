import { describe, expect, it } from "vitest";
import { transitionCaseSchema } from "./transition.js";

describe("transitionCaseSchema", () => {
  it("validates valid transition payloads", () => {
    const valid = transitionCaseSchema.safeParse({
      to: "preop",
      reason: "Patient escorted to pre-op",
      overrideReason: "Clinical judgment waiver",
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.to).toBe("preop");
      expect(valid.data.reason).toBe("Patient escorted to pre-op");
      expect(valid.data.overrideReason).toBe("Clinical judgment waiver");
    }
  });

  it("accepts minimal payload with only 'to'", () => {
    const valid = transitionCaseSchema.safeParse({ to: "in_room" });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.to).toBe("in_room");
      expect(valid.data.reason).toBeUndefined();
      expect(valid.data.overrideReason).toBeUndefined();
    }
  });

  it("rejects empty target stage", () => {
    const invalid = transitionCaseSchema.safeParse({ to: "" });
    expect(invalid.success).toBe(false);
  });

  it("rejects whitespace-only target stage", () => {
    const invalid = transitionCaseSchema.safeParse({ to: "   " });
    expect(invalid.success).toBe(false);
  });

  it("rejects reasons longer than 500 characters", () => {
    const tooLong = "a".repeat(501);
    const invalid = transitionCaseSchema.safeParse({
      to: "preop",
      reason: tooLong,
    });
    expect(invalid.success).toBe(false);
  });
});
