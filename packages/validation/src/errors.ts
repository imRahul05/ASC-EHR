import { ZodError } from "zod";
export type { ZodType, ZodSchema } from "zod";

/** Type guard checking if an error is a ZodError without importing Zod directly in apps (LM-001). */
export function isZodError(error: Error | object | null | undefined): error is ZodError {
  return (
    error instanceof ZodError ||
    (error !== null &&
      typeof error === "object" &&
      (error as Error).name === "ZodError" &&
      "issues" in error &&
      Array.isArray((error as ZodError).issues))
  );
}

export interface FormattedValidationError {
  readonly code: "invalid_payload";
  readonly message: string;
  readonly details: Record<string, string>;
  readonly issues: readonly { readonly path: string; readonly message: string }[];
}

/** Formats a ZodError into the standard ApiErrorPayload shape with details map and issues array. */
export function formatZodError(error: ZodError): FormattedValidationError {
  const details: Record<string, string> = {};
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");
    const key = path.length > 0 ? path : "root";
    details[key] = issue.message;
    return { path: key, message: issue.message };
  });

  return {
    code: "invalid_payload",
    message: "Invalid request payload.",
    details,
    issues,
  };
}
