import { describe, expect, it } from "vitest";
import { baseJobDataSchema, phiJobDataSchema } from "./jobs.js";

describe("baseJobDataSchema", () => {
  it("accepts tenant and facility ids next to the other ids", () => {
    expect(baseJobDataSchema.parse({ tenantId: "t-1", facilityId: "org-1", actorId: "Practitioner/p-1" })).toEqual({
      tenantId: "t-1",
      facilityId: "org-1",
      actorId: "Practitioner/p-1",
    });
  });

  it("refuses free text in a facility id and unknown keys", () => {
    expect(baseJobDataSchema.safeParse({ facilityId: "facility A; drop" }).success).toBe(false);
    expect(baseJobDataSchema.safeParse({ facility: "org-1" }).success).toBe(false);
  });
});

describe("phiJobDataSchema", () => {
  it("requires the tenant and the facility, so a PHI job is never unscoped (#60)", () => {
    expect(phiJobDataSchema.safeParse({ tenantId: "t-1", patientId: "pat-1" }).success).toBe(false);
    expect(phiJobDataSchema.safeParse({ facilityId: "org-1", patientId: "pat-1" }).success).toBe(false);
    expect(phiJobDataSchema.safeParse({ tenantId: "t-1", facilityId: "org-1", patientId: "pat-1" }).success).toBe(true);
  });

  it("keeps the identifiers-only contract of the base schema", () => {
    expect(phiJobDataSchema.safeParse({ tenantId: "t-1", facilityId: "org-1", note: "free text" }).success).toBe(false);
  });
});
