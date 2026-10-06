import { z } from "zod";

// Authentication schemas (shared by apps/web forms and apps/api). No schema here knows about
// roles: who a user is and what they may do come from role assignments (see ./authz).

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Request for an account. Accounts are invited by an administrator (no self-signup), so this
 * only asks to be contacted: no role, no clinical identifiers. Roles are assigned by the admin.
 */
export const accessRequestSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required"),
  email: z.string().trim().email("Please enter a valid email address"),
  facilityCode: z.string().trim().optional(),
});

export type AccessRequestFormData = z.infer<typeof accessRequestSchema>;
