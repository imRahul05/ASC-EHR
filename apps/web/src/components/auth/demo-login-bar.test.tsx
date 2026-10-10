import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoLoginBar } from "./demo-login-bar";

const mockState = vi.hoisted(() => ({
  isMocking: true,
}));

vi.mock("@asc/config/public-env", () => ({
  isApiMockingEnabled: () => mockState.isMocking,
}));

vi.mock("../../hooks/use-auth", () => ({
  useAuth: () => ({
    loginWithDemo: vi.fn(),
    isDemoLoggingIn: false,
  }),
  useDemoPresets: () => ({
    data: [
      { id: "demo-admin", fullName: "Admin User", description: "Admin" },
    ],
    isPending: false,
    isError: false,
  }),
}));

describe("DemoLoginBar", () => {
  beforeEach(() => {
    mockState.isMocking = true;
  });

  it("renders demo personas when API mocking is enabled", () => {
    mockState.isMocking = true;
    const html = renderToStaticMarkup(<DemoLoginBar />);
    expect(html).toContain("Explore as");
    expect(html).toContain('data-testid="demo-personas"');
  });

  it("renders null when API mocking is disabled", () => {
    mockState.isMocking = false;
    const html = renderToStaticMarkup(<DemoLoginBar />);
    expect(html).toBe("");
  });
});
