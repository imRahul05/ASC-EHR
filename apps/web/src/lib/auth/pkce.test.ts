import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPendingCodeVerifier, getPendingCodeVerifier, setPendingCodeVerifier } from "./pkce";

describe("pkce storage helper", () => {
  const storageMap = new Map<string, string>();
  const mockSessionStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, val: string) => {
      storageMap.set(key, val);
    },
    removeItem: (key: string) => {
      storageMap.delete(key);
    },
    clear: () => {
      storageMap.clear();
    },
  };

  beforeEach(() => {
    storageMap.clear();
    vi.stubGlobal("window", { sessionStorage: mockSessionStorage });
    clearPendingCodeVerifier();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("retrieves verifier from sessionStorage when memory verifier is uninitialized (simulating post-redirect page load)", () => {
    mockSessionStorage.setItem("asc_pkce_code_verifier", "redirect_verifier_789");
    expect(getPendingCodeVerifier()).toBe("redirect_verifier_789");

    clearPendingCodeVerifier();
    expect(getPendingCodeVerifier()).toBe("");
    expect(mockSessionStorage.getItem("asc_pkce_code_verifier")).toBeNull();
  });
});
