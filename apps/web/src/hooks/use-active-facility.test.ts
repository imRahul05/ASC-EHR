import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveFacility } from "./use-active-facility";

type ActiveFacilityResult = ReturnType<typeof useActiveFacility>;

interface MockAuthState {
  readonly facilityId: string | null;
  readonly facilities: readonly { readonly id: string; readonly name: string }[];
}

let mockState: MockAuthState = {
  facilityId: null,
  facilities: [],
};

vi.mock("@/lib/stores/auth.store", () => ({
  useAuthStore: <T,>(selector: (state: MockAuthState) => T): T => selector(mockState),
}));

describe("useActiveFacility", () => {
  beforeEach(() => {
    mockState = {
      facilityId: null,
      facilities: [],
    };
  });

  function getActiveFacility(): ActiveFacilityResult {
    let captured: ActiveFacilityResult | null = null;
    function TestHook() {
      captured = useActiveFacility();
      return null;
    }
    renderToStaticMarkup(createElement(TestHook));
    if (!captured) throw new Error("Hook did not execute");
    return captured;
  }

  it("returns { facilityId: 'org-1', facility: { id: 'org-1', name: 'Metro GI ASC' }, hasFacility: true } when active", () => {
    mockState = {
      facilityId: "org-1",
      facilities: [{ id: "org-1", name: "Metro GI ASC" }],
    };

    const result = getActiveFacility();
    expect(result).toEqual({
      facilityId: "org-1",
      facility: { id: "org-1", name: "Metro GI ASC" },
      hasFacility: true,
    });
  });

  it("returns { facilityId: null, facility: null, hasFacility: false } when no facility exists", () => {
    mockState = {
      facilityId: null,
      facilities: [],
    };

    const result = getActiveFacility();
    expect(result).toEqual({
      facilityId: null,
      facility: null,
      hasFacility: false,
    });
  });
});
