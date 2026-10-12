import { describe, expect, it, vi } from "vitest";
import RootPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("RootPage", () => {
  it("redirects root path to clinical login", async () => {
    const { redirect } = await import("next/navigation");
    RootPage();
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
