import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SignInCallbackContent } from "./signin-callback-content";

const mockParams = vi.hoisted(() => ({
  code: null as string | null,
  error: null as string | null,
  errorDescription: null as string | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "code") return mockParams.code;
      if (key === "error") return mockParams.error;
      if (key === "error_description") return mockParams.errorDescription;
      return null;
    },
  }),
}));

describe("SignInCallbackContent", () => {
  it("renders error state when error is in search params", () => {
    mockParams.error = "access_denied";
    mockParams.errorDescription = "User cancelled authorization";
    const html = renderToStaticMarkup(<SignInCallbackContent />);
    expect(html).toContain("Sign-in failed");
    expect(html).toContain("User cancelled authorization");
  });

  it("renders error state when code is missing", () => {
    mockParams.error = null;
    mockParams.errorDescription = null;
    mockParams.code = null;
    const html = renderToStaticMarkup(<SignInCallbackContent />);
    expect(html).toContain("Sign-in failed");
    expect(html).toContain("No authorization code returned");
  });
});
