import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { registerPatientSchema } from "@asc/validation/patients/register";
import { RegistrationForm, prepareRegistrationPayload } from "./registration-form";

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

  describe("prepareRegistrationPayload", () => {
    const baseInput = {
      facilityId: "fac-1",
      name: { family: "Doe", given: ["Jane"] },
      dateOfBirth: "1980-05-10",
      gender: "female" as const,
      phone: "555-555-5555",
      address: { line: [""], city: "", state: "", postalCode: "", country: "USA" },
      insurance: {
        payerId: "PAYER-01",
        memberId: "MEM-12345",
        relationship: "self" as const,
      },
      escort: {
        name: "John Doe",
        phone: "555-444-3333",
        relationship: "spouse",
      },
    };

    it("sanitizes empty address fields to undefined", () => {
      const payload = prepareRegistrationPayload(baseInput, "fac-1", {
        hasInsurance: false,
        hasEscort: false,
      });

      expect(payload.address).toBeUndefined();
      expect(payload.insurance).toBeUndefined();
      expect(payload.escort).toBeUndefined();
      expect(payload.confirmDuplicate).toBe(false);
    });

    it("includes populated address without blank fields", () => {
      const payload = prepareRegistrationPayload(
        {
          ...baseInput,
          address: {
            line: ["123 Medical Center Dr"],
            city: "Metropolis",
            state: "NY",
            postalCode: "10001",
            country: "USA",
          },
        },
        "fac-1",
        {
          hasInsurance: false,
          hasEscort: false,
        },
      );

      expect(payload.address).toEqual({
        line: ["123 Medical Center Dr"],
        city: "Metropolis",
        state: "NY",
        postalCode: "10001",
        country: "USA",
      });
    });

    it("preserves insurance and escort when toggled on and confirmDuplicate is true", () => {
      const payload = prepareRegistrationPayload(baseInput, "fac-1", {
        hasInsurance: true,
        hasEscort: true,
        confirmDuplicateOverride: true,
      });

      expect(payload.insurance).toEqual({
        payerId: "PAYER-01",
        memberId: "MEM-12345",
        relationship: "self",
        planName: undefined,
        groupNumber: undefined,
      });
      expect(payload.escort).toEqual({
        name: "John Doe",
        phone: "555-444-3333",
        relationship: "spouse",
      });
      expect(payload.confirmDuplicate).toBe(true);
    });
  });
});
