import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SignaturePad } from "./signature-pad";

describe("SignaturePad component", () => {
  it("renders canvas element with proper accessibility attributes and role", () => {
    const handleChange = vi.fn();
    const html = renderToStaticMarkup(
      <SignaturePad label="Patient informed consent" onChange={handleChange} />,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Patient informed consent: empty — draw with finger, pen or mouse"');
    expect(html).toContain('data-testid="signature-pad-canvas"');
    expect(html).toContain("touch-none");
  });

  it("renders clear button with minimum 44px touch target (NFR-11)", () => {
    const handleChange = vi.fn();
    const html = renderToStaticMarkup(
      <SignaturePad label="Patient signature" onChange={handleChange} />,
    );

    expect(html).toContain('data-testid="signature-pad-clear"');
    // min-h-11 is Tailwind 44px class for touch targets
    expect(html).toContain("min-h-11");
    expect(html).toContain("Clear");
  });

  it("applies opacity and disabled styles when disabled", () => {
    const handleChange = vi.fn();
    const html = renderToStaticMarkup(
      <SignaturePad label="Patient signature" onChange={handleChange} disabled />,
    );

    expect(html).toContain("opacity-50");
    expect(html).toContain("disabled");
  });

  it("renders helper label for empty canvas state", () => {
    const handleChange = vi.fn();
    const html = renderToStaticMarkup(
      <SignaturePad label="Patient signature" onChange={handleChange} />,
    );

    expect(html).toContain("Sign here");
    expect(html).toContain("No signature yet");
  });
});
