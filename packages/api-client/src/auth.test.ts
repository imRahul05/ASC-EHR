import { afterEach, describe, expect, it, vi } from "vitest";
import { getMe } from "./auth";
import { queryKeys } from "./react/query-keys";

afterEach(() => {
  vi.unstubAllGlobals();
});

const me = {
  principal: {
    kind: "staff",
    id: "user-1",
    membershipId: "membership-1",
    tenant: { tenantId: "t1", medplumProjectId: "p1" },
    grants: [{ scope: "facility", facilityId: "A", roleKeys: ["rn"], capabilities: ["case.read"] }],
  },
  facilities: [{ id: "A", name: "Facility A" }],
};

describe("getMe", () => {
  it("requests /me and returns the parsed principal", async () => {
    const fetchMock = vi.fn((_input: string) => Promise.resolve(Response.json(me)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getMe()).resolves.toEqual(me);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/me");
  });

  it("rejects a response that is not a valid principal", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ principal: { kind: "admin" }, facilities: [] })));
    await expect(getMe()).rejects.toThrow("Unexpected /me response shape");
  });

  it("has a stable query key under the auth domain", () => {
    expect(queryKeys.auth.me).toEqual(["auth", "me"]);
    expect(queryKeys.auth.me[0]).toBe(queryKeys.auth.all[0]);
  });
});
