import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RequireAuth } from "./require-auth";

const mockState = vi.hoisted(() => ({
  isAuthenticated: false,
  restoreSession: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("../../hooks/use-auth", () => ({
  useAuth: () => mockState,
}));

describe("RequireAuth", () => {
  it("renders children when authenticated", () => {
    mockState.isAuthenticated = true;
    const html = renderToStaticMarkup(
      <RequireAuth>
        <div data-testid="protected-content">Secret Clinical PHI</div>
      </RequireAuth>,
    );
    expect(html).toContain("Secret Clinical PHI");
    expect(html).not.toContain('data-testid="auth-redirecting"');
  });

  it("renders redirecting skeleton when not authenticated", () => {
    mockState.isAuthenticated = false;
    const html = renderToStaticMarkup(
      <RequireAuth>
        <div data-testid="protected-content">Secret Clinical PHI</div>
      </RequireAuth>,
    );
    expect(html).not.toContain("Secret Clinical PHI");
    expect(html).toContain('data-testid="auth-redirecting"');
  });
});
