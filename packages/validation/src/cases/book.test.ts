import { describe, expect, it } from "vitest";
import {
  bookCaseFormSchema,
  bookCaseInputFrom,
  bookCaseResultSchema,
  bookCaseSchema,
  procedureIntentSchema,
} from "./book.js";

const futureDate = (offsetMinutes = 60) =>
  new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();

const validPayload = {
  facilityId: "facility-asc-1",
  patientId: "patient-101",
  roomId: "room-1",
  scheduledAt: futureDate(120),
  primaryPhysicianId: "practitioner-dr-smith",
  procedureIntent: "screening" as const,
  primaryProcedureCode: "45378",
};

describe("bookCaseSchema", () => {
  it("validates a minimal valid case booking with default duration (45)", () => {
    const result = bookCaseSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.durationMinutes).toBe(45);
    expect(result.data.facilityId).toBe("facility-asc-1");
    expect(result.data.patientId).toBe("patient-101");
    expect(result.data.roomId).toBe("room-1");
    expect(result.data.procedureIntent).toBe("screening");
    expect(result.data.primaryProcedureCode).toBe("45378");
  });

  it("validates a full case booking with all optional fields", () => {
    const fullPayload = {
      ...validPayload,
      durationMinutes: 90,
      anesthesiologistId: "practitioner-crna-jones",
      procedureIntent: "diagnostic" as const,
      primaryProcedureCode: "43239",
      secondaryProcedureCodes: ["45380", "45385"],
      notes: "Patient prefers propofol sedation. Prior polyps found in 2021.",
    };
    const result = bookCaseSchema.safeParse(fullPayload);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.durationMinutes).toBe(90);
    expect(result.data.anesthesiologistId).toBe("practitioner-crna-jones");
    expect(result.data.secondaryProcedureCodes).toEqual(["45380", "45385"]);
    expect(result.data.notes).toBe("Patient prefers propofol sedation. Prior polyps found in 2021.");
  });

  it("accepts all four procedure intents", () => {
    const intents = ["screening", "surveillance", "diagnostic", "therapeutic"] as const;
    for (const intent of intents) {
      expect(procedureIntentSchema.safeParse(intent).success).toBe(true);
      const res = bookCaseSchema.safeParse({ ...validPayload, procedureIntent: intent });
      expect(res.success).toBe(true);
    }
    expect(procedureIntentSchema.safeParse("experimental").success).toBe(false);
  });

  it("rejects non-FHIR facilityId and patientId", () => {
    expect(bookCaseSchema.safeParse({ ...validPayload, facilityId: "" }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, facilityId: "bad/fac" }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, facilityId: "bad fac" }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, patientId: "" }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, patientId: "pat@123" }).success).toBe(false);
  });

  it("rejects non-FHIR primaryPhysicianId and anesthesiologistId", () => {
    expect(bookCaseSchema.safeParse({ ...validPayload, primaryPhysicianId: "" }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, primaryPhysicianId: "doc#1" }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, anesthesiologistId: "crna#1" }).success).toBe(false);
  });

  it("rejects scheduledAt outside the 30-minute grace window", () => {
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
    const result = bookCaseSchema.safeParse({ ...validPayload, scheduledAt: pastDate });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.message.includes("past"))).toBe(true);
  });

  it("permits scheduledAt within the 30-minute grace window for immediate add-on cases", () => {
    const graceDate = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const result = bookCaseSchema.safeParse({ ...validPayload, scheduledAt: graceDate });
    expect(result.success).toBe(true);
  });

  it("rejects invalid calendar dates preventing month rollover", () => {
    expect(
      bookCaseSchema.safeParse({ ...validPayload, scheduledAt: "2026-02-31T10:00:00Z" }).success,
    ).toBe(false);
    expect(
      bookCaseSchema.safeParse({ ...validPayload, scheduledAt: "2026-04-31T10:00:00Z" }).success,
    ).toBe(false);
  });

  it("rejects scheduledAt missing timezone or malformed", () => {
    expect(bookCaseSchema.safeParse({ ...validPayload, scheduledAt: "2026-10-15" }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, scheduledAt: "2026-10-15T10:00:00" }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, scheduledAt: "invalid-date" }).success).toBe(false);
  });

  it("enforces duration boundaries between 15 and 240 minutes", () => {
    expect(bookCaseSchema.safeParse({ ...validPayload, durationMinutes: 14 }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, durationMinutes: 241 }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, durationMinutes: 15 }).success).toBe(true);
    expect(bookCaseSchema.safeParse({ ...validPayload, durationMinutes: 240 }).success).toBe(true);
    expect(bookCaseSchema.safeParse({ ...validPayload, durationMinutes: 45.5 }).success).toBe(false);
  });

  it("rejects empty or non-FHIR room ID and primary procedure code", () => {
    expect(bookCaseSchema.safeParse({ ...validPayload, roomId: "" }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, roomId: "OR #1" }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, roomId: "room/1" }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, roomId: "room 1" }).success).toBe(false);
    expect(bookCaseSchema.safeParse({ ...validPayload, primaryProcedureCode: "" }).success).toBe(false);
  });

  it("transforms empty or whitespace notes to undefined and accepts multiline notes", () => {
    const emptyResult = bookCaseSchema.safeParse({ ...validPayload, notes: "" });
    expect(emptyResult.success).toBe(true);
    if (emptyResult.success) {
      expect(emptyResult.data.notes).toBeUndefined();
    }

    const whitespaceResult = bookCaseSchema.safeParse({ ...validPayload, notes: "   " });
    expect(whitespaceResult.success).toBe(true);
    if (whitespaceResult.success) {
      expect(whitespaceResult.data.notes).toBeUndefined();
    }

    const multiline = "Screening colonoscopy.\nSedation required.";
    const multilineResult = bookCaseSchema.safeParse({ ...validPayload, notes: multiline });
    expect(multilineResult.success).toBe(true);
    if (multilineResult.success) {
      expect(multilineResult.data.notes).toBe(multiline);
    }
  });

  it("rejects notes exceeding 500 characters", () => {
    const longNotes = "a".repeat(501);
    expect(bookCaseSchema.safeParse({ ...validPayload, notes: longNotes }).success).toBe(false);
  });

  it("validates bookCaseResultSchema", () => {
    const validResult = {
      caseId: "enc-101",
      appointmentId: "apt-202",
      encounterId: "enc-101",
      scheduledAt: futureDate(120),
      roomId: "room-1",
    };
    expect(bookCaseResultSchema.safeParse(validResult).success).toBe(true);
    expect(bookCaseResultSchema.safeParse({ ...validResult, caseId: "" }).success).toBe(false);
  });

  it("validates bookCaseFormSchema and transforms via bookCaseInputFrom", () => {
    const validFormData = {
      facilityId: "fac-1",
      patientId: "pat-101",
      roomId: "room-2",
      date: "2026-10-25",
      startTime: "10:30",
      durationMinutes: 45,
      primaryPhysicianId: "doc-1",
      anesthesiologistId: "anes-1",
      procedureIntent: "screening" as const,
      primaryProcedureCode: "45378",
      notes: "Screening procedure",
    };
    const parsed = bookCaseFormSchema.safeParse(validFormData);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const input = bookCaseInputFrom(parsed.data);
      expect(input.facilityId).toBe("fac-1");
      expect(input.patientId).toBe("pat-101");
      expect(input.roomId).toBe("room-2");
      expect(input.durationMinutes).toBe(45);
      expect(input.scheduledAt).toContain("2026-10-25");
      expect(input.primaryPhysicianId).toBe("doc-1");
      expect(input.anesthesiologistId).toBe("anes-1");
      expect(input.primaryProcedureCode).toBe("45378");
      expect(input.procedureIntent).toBe("screening");
      expect(input.notes).toBe("Screening procedure");
    }
  });

  it("rejects past date/time in bookCaseFormSchema", () => {
    const pastFormData = {
      facilityId: "fac-1",
      patientId: "pat-101",
      roomId: "room-2",
      date: "2020-01-01",
      startTime: "08:00",
      durationMinutes: 45,
      primaryPhysicianId: "doc-1",
      procedureIntent: "diagnostic" as const,
      primaryProcedureCode: "43239",
    };
    expect(bookCaseFormSchema.safeParse(pastFormData).success).toBe(false);
  });

  it("rejects invalid calendar date in bookCaseFormSchema (e.g. Feb 31)", () => {
    const invalidDateFormData = {
      facilityId: "fac-1",
      patientId: "pat-101",
      roomId: "room-2",
      date: "2026-02-31",
      startTime: "08:00",
      durationMinutes: 45,
      primaryPhysicianId: "doc-1",
      procedureIntent: "diagnostic" as const,
      primaryProcedureCode: "43239",
    };
    expect(bookCaseFormSchema.safeParse(invalidDateFormData).success).toBe(false);
  });
});
