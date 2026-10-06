import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FacilitySwitcher } from "./facility-switcher";
import { WorkspaceSwitcher } from "./workspace-switcher";

const state = vi.hoisted(() => ({
  facilities: [] as { id: string; name: string }[],
  facilityId: null as string | null,
  workspaces: [] as { key: string; label: string; home: string }[],
  currentKey: null as string | null,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock("../../hooks/use-auth", () => ({
  useAuth: () => ({ facilities: state.facilities, facilityId: state.facilityId, selectFacility: () => undefined }),
}));
vi.mock("../../hooks/use-workspace", () => ({
  useWorkspace: () => ({
    workspaces: state.workspaces,
    current: state.workspaces.find((workspace) => workspace.key === state.currentKey) ?? null,
    select: () => undefined,
  }),
}));

describe("FacilitySwitcher", () => {
  it("is hidden with one facility or none", () => {
    state.facilities = [{ id: "A", name: "Facility A" }];
    expect(renderToStaticMarkup(<FacilitySwitcher />)).toBe("");
    state.facilities = [];
    expect(renderToStaticMarkup(<FacilitySwitcher />)).toBe("");
  });

  it("shows the current facility name when the user has several", () => {
    state.facilities = [
      { id: "A", name: "Facility A" },
      { id: "B", name: "Facility B" },
    ];
    state.facilityId = "B";
    const html = renderToStaticMarkup(<FacilitySwitcher />);
    expect(html).toContain('data-testid="facility-switcher"');
    expect(html).toContain("Facility B");
  });
});

describe("WorkspaceSwitcher", () => {
  it("is hidden with one workspace", () => {
    state.workspaces = [{ key: "nursing", label: "Nursing", home: "/dashboard" }];
    state.currentKey = "nursing";
    expect(renderToStaticMarkup(<WorkspaceSwitcher />)).toBe("");
  });

  it("shows the current workspace when the user has several", () => {
    state.workspaces = [
      { key: "anesthesia", label: "Anesthesia", home: "/dashboard" },
      { key: "nursing", label: "Nursing", home: "/dashboard" },
    ];
    state.currentKey = "nursing";
    const html = renderToStaticMarkup(<WorkspaceSwitcher />);
    expect(html).toContain('data-testid="workspace-switcher"');
    expect(html).toContain("Nursing");
  });
});
