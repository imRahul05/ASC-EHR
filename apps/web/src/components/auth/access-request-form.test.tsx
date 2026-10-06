import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccessRequestForm } from "./access-request-form";

function render() {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <AccessRequestForm />
    </QueryClientProvider>,
  );
}

describe("AccessRequestForm", () => {
  const html = render();

  it("asks for a name, an email and an optional facility id, and nothing else", () => {
    expect(html).toContain('id="access-fullName"');
    expect(html).toContain('id="access-email"');
    expect(html).toContain('id="access-facilityCode"');
    expect(html.match(/<input/g)).toHaveLength(3);
  });

  it("offers no role choice and no password", () => {
    expect(html).not.toContain('role="radio"');
    expect(html).not.toContain('type="password"');
    expect(html).not.toMatch(/signup-role|Your role/i);
  });

  it("submits as a request for access and links back to sign-in", () => {
    expect(html).toContain('data-testid="access-request-submit"');
    expect(html).toContain("Request access");
    expect(html).toContain('href="/login"');
  });
});
