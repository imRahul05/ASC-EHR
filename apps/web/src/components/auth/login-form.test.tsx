import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const mockAuth = vi.hoisted(() => ({
  login: vi.fn(),
  verifyTotp: vi.fn(),
  isLoggingIn: false,
}));

vi.mock("../../hooks/use-auth", () => ({
  useAuth: () => mockAuth,
}));

describe("LoginForm", () => {
  it("renders credentials form with email and password inputs", () => {
    const html = renderToStaticMarkup(<LoginForm />);
    expect(html).toContain('id="login-email"');
    expect(html).toContain('id="login-password"');
    expect(html).toContain('data-testid="login-submit"');
    expect(html).toContain("Sign in with email");
    expect(html).toContain('href="/signup"');
  });

  it("includes reset administrator notice for password field", () => {
    const html = renderToStaticMarkup(<LoginForm />);
    expect(html).toContain("Reset via your administrator");
  });
});
