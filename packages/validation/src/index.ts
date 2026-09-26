import { z } from "zod";

// Shared schemas for frontend and backend
export const baseSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// GET /health — shared by apps/api (response) and @asc/api-client (parsing)
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// AI agent outputs (@asc/agents) — returned by apps/api, rendered by apps/web
export * from "./agents/discharge-instructions.js";

// Background job contracts — enqueued by apps/api, processed by apps/worker
export * from "./jobs.js";

// Authentication and Multi-Persona Signup Schemas
export const userRoleSchema = z.enum([
  "SURGEON",
  "ANESTHESIOLOGIST",
  "NURSE",
  "ADMIN",
  "PATIENT",
]);

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    role: userRoleSchema,
    fullName: z.string().min(2, "Full name is required"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    npi: z.string().optional(),
    licenseNumber: z.string().optional(),
    specialty: z.string().optional(),
    careStage: z.string().optional(),
    department: z.string().optional(),
    facilityCode: z.string().optional(),
    dateOfBirth: z.string().optional(),
    escortName: z.string().optional(),
    escortPhone: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "SURGEON" || data.role === "ANESTHESIOLOGIST") {
      if (!data.npi || data.npi.trim().length !== 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "10-digit NPI number is required for clinicians",
          path: ["npi"],
        });
      }
      if (!data.licenseNumber || data.licenseNumber.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Medical license number is required",
          path: ["licenseNumber"],
        });
      }
    }

    if (data.role === "NURSE") {
      if (!data.licenseNumber || data.licenseNumber.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "RN License number is required",
          path: ["licenseNumber"],
        });
      }
      if (!data.careStage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Primary care stage is required",
          path: ["careStage"],
        });
      }
    }

    if (data.role === "ADMIN") {
      if (!data.facilityCode || data.facilityCode.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ASC Facility identifier is required",
          path: ["facilityCode"],
        });
      }
    }

    if (data.role === "PATIENT") {
      if (!data.dateOfBirth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Date of birth is required for patient portal setup",
          path: ["dateOfBirth"],
        });
      }
      if (!data.escortName || data.escortName.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Escort/Driver name is required for sedated procedures",
          path: ["escortName"],
        });
      }
      if (!data.escortPhone || data.escortPhone.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Escort contact phone number is required",
          path: ["escortPhone"],
        });
      }
    }
  });

export type SignupFormData = z.infer<typeof signupSchema>;
