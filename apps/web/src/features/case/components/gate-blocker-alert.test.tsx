import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GateBlockerAlert } from "./gate-blocker-alert";

describe("GateBlockerAlert", () => {
  it("renders nothing when there are no reasons", () => {
    const html = renderToStaticMarkup(<GateBlockerAlert reasons={[]} />);
    expect(html).toBe("");
  });

  it("renders structured 409 Gate 1 conflict reasons and zero-waiver policy", () => {
    const html = renderToStaticMarkup(
      <GateBlockerAlert
        reasons={["GATE1_CONSENT", "GATE1_IDENTITY"]}
      />,
    );

    expect(html).toContain("Hard Gate 1 Transition Blocked");
    expect(html).toContain("Informed Consent Required");
    expect(html).toContain("Patient Identity Verification Required");
    expect(html).toContain("data-testid=\"gate-blocker-reason-GATE1_CONSENT\"");
    expect(html).toContain("data-testid=\"gate-blocker-reason-GATE1_IDENTITY\"");

    // Zero-waiver policy verification (AC-D-12-4, AC-F-02-3)
    expect(html).toContain("AC-D-12-4");
    expect(html).toContain("AC-F-02-3");
    expect(html).toContain("Consent and Identity checks have a strict zero-waiver policy");
  });

  it("renders action buttons for resolving consent and pre-op blockers", () => {
    const onOpenConsent = vi.fn();
    const onOpenPreop = vi.fn();

    const html = renderToStaticMarkup(
      <GateBlockerAlert
        reasons={["GATE1_CONSENT", "GATE1_HP"]}
        onOpenConsent={onOpenConsent}
        onOpenPreop={onOpenPreop}
      />,
    );

    expect(html).toContain("data-testid=\"gate-resolve-consent-button\"");
    expect(html).toContain("Sign Informed Consent");
    expect(html).toContain("data-testid=\"gate-resolve-preop-button\"");
    expect(html).toContain("Open Pre-Op Bay");
  });
});
