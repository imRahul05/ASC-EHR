import { beforeEach, describe, expect, it } from "vitest";
import { clearPendingCodeVerifier, getPendingCodeVerifier, setPendingCodeVerifier } from "./pkce";

describe("pkce storage helper", () => {
  beforeEach(() => {
    clearPendingCodeVerifier();
  });

  it("stores and retrieves verifier in memory", () => {
    setPendingCodeVerifier("test_verifier_12345");
    expect(getPendingCodeVerifier()).toBe("test_verifier_12345");
  });

  it("clears verifier", () => {
    setPendingCodeVerifier("test_verifier_12345");
    clearPendingCodeVerifier();
    expect(getPendingCodeVerifier()).toBe("");
  });
});
