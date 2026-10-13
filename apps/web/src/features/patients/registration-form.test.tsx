import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { registerPatientSchema } from "@asc/validation/patients/register";
import { RegistrationForm } from "./registration-form";

vi.mock("../../lib/stores/auth.store", () => ({
  useAuthStore: (selector: (s: { facilityId: string | null }) => unknown) =>
    selector({ facilityId: "fac-test-123" }),
}));

vi.mock("@asc/api-client/react", () => ({
  useRegisterPatient: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  usePatient: () => ({
    data: null,
    isPending: false,
  }),
}));

describe("RegistrationForm", () => {
  it("renders all four intake sections with clean accessibility attributes", () => {
    const html = renderToStaticMarkup(<RegistrationForm />);

    expect(html).toContain('data-testid="registration-section-demographics"');
    expect(html).toContain('data-testid="registration-section-address"');
    expect(html).toContain('data-testid="registration-section-insurance"');
    expect(html).toContain('data-testid="registration-section-escort"');

    expect(html).toContain('id="reg-first-name"');
    expect(html).toContain('id="reg-last-name"');
    expect(html).toContain('id="reg-dob"');
    expect(html).toContain('id="reg-gender"');
    expect(html).toContain('id="reg-phone"');
    expect(html).toContain('id="reg-street"');
    expect(html).toContain('id="reg-city"');
    expect(html).toContain('id="reg-state"');
    expect(html).toContain('id="reg-zip"');

    expect(html).toContain('data-testid="registration-submit-button"');
  });

  describe("Validation Edge Cases", () => {
    it("rejects future date of birth with informative error message", () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const payload = {
        name: { family: "Smith", given: ["Alice"] },
        dateOfBirth: tomorrow,
        gender: "female" as const,
        phone: "555-123-4567",
      };

      const result = registerPatientSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const dobError = result.error.issues.find((i) => i.path.includes("dateOfBirth"));
        expect(dobError?.message).toBe("Date of birth must be a valid past date");
      }
    });

    it("accepts valid past date of birth", () => {
      const payload = {
        name: { family: "Smith", given: ["Alice"] },
        dateOfBirth: "1990-01-01",
        gender: "female" as const,
        phone: "555-123-4567",
      };

      const result = registerPatientSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("sanitizes empty address so omitted address is valid", () => {
      const payloadWithoutAddress = {
        name: { family: "Smith", given: ["Alice"] },
        dateOfBirth: "1990-01-01",
        gender: "female" as const,
        phone: "555-123-4567",
      };

      const result = registerPatientSchema.safeParse(payloadWithoutAddress);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.address).toBeUndefined();
      }
    });
  });
});
