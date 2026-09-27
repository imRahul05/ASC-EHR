import type { UserRole } from "@asc/types";
import type { SignupFormData } from "@asc/validation/auth";

/** Synthetic demo auto-fill values per role (not real people). Mock auth only. */
export const SIGNUP_SAMPLES: Readonly<Record<UserRole, Partial<SignupFormData>>> = {
  SURGEON: {
    fullName: "Dr. Marcus Brody, MD",
    email: "m.brody@gihealth.org",
    npi: "1829304912",
    licenseNumber: "MD-772910-FL",
    specialty: "Advanced Therapeutic Endoscopy",
    department: "Endoscopy Surgical Suite",
  },
  ANESTHESIOLOGIST: {
    fullName: "Dr. Rachel Kim, MD",
    email: "r.kim@anesthesiapartners.org",
    npi: "1948201948",
    licenseNumber: "MD-881923-FL",
    specialty: "Sedation & Ambulatory Anesthesia",
    department: "Anesthesia Care Team",
  },
  NURSE: {
    fullName: "David Miller, BSN, RN",
    email: "d.miller@gihealth.org",
    licenseNumber: "RN-901824-FL",
    careStage: "Intra-op Circulator",
    department: "Clinical Nursing Staff",
  },
  ADMIN: {
    fullName: "Claire Davenport",
    email: "c.davenport@gihealth.org",
    facilityCode: "ASC-FL-991",
    department: "Surgery Center Management",
  },
  PATIENT: {
    fullName: "Eleanor Vance",
    email: "eleanor.vance@mail.com",
    dateOfBirth: "1962-03-15",
    escortName: "Thomas Vance (Son)",
    escortPhone: "(555) 442-8901",
  },
};

export const SIGNUP_SAMPLE_PASSWORD = "Password@123";
