import { describe, expect, it } from "vitest";
import {
  ANESTHESIA_DOUBLE_BOOKED_CODE,
  ANESTHESIA_DOUBLE_BOOKED_MESSAGE,
  evaluateScheduleConflict,
  PHYSICIAN_DOUBLE_BOOKED_CODE,
  PHYSICIAN_DOUBLE_BOOKED_MESSAGE,
  ROOM_DOUBLE_BOOKED_CODE,
  ROOM_DOUBLE_BOOKED_MESSAGE,
  type ScheduleSlot,
} from "./conflicts";

const T0 = 1770000000000; // arbitrary reference timestamp (ms)
const MIN = 60 * 1000;

const baseCandidate: ScheduleSlot = {
  id: "candidate-1",
  roomId: "room-1",
  startMs: T0,
  durationMinutes: 45, // T0 to T0 + 45 min
  primaryPhysicianId: "doc-1",
  anesthesiologistId: "crna-1",
};

describe("evaluateScheduleConflict", () => {
  it("passes when there are no existing cases", () => {
    const result = evaluateScheduleConflict(baseCandidate, []);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("passes for adjacent non-overlapping cases (immediate predecessor and successor)", () => {
    const existingCases: ScheduleSlot[] = [
      // Predecessor finishes right when candidate starts
      {
        id: "prev-case",
        roomId: "room-1",
        startMs: T0 - 45 * MIN,
        durationMinutes: 45,
        primaryPhysicianId: "doc-1",
        anesthesiologistId: "crna-1",
      },
      // Successor starts right when candidate finishes
      {
        id: "next-case",
        roomId: "room-1",
        startMs: T0 + 45 * MIN,
        durationMinutes: 45,
        primaryPhysicianId: "doc-1",
        anesthesiologistId: "crna-1",
      },
    ];

    const result = evaluateScheduleConflict(baseCandidate, existingCases);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("detects conflict on overlapping edges (overlap by 1 millisecond at start or end)", () => {
    // Existing overlaps by 1ms before candidate ends
    const endOverlap: ScheduleSlot = {
      id: "edge-overlap-1",
      roomId: "room-1",
      startMs: T0 + 45 * MIN - 1, // 1 ms overlap
      durationMinutes: 30,
      primaryPhysicianId: "doc-2",
    };

    const res1 = evaluateScheduleConflict(baseCandidate, [endOverlap]);
    expect(res1.ok).toBe(false);
    expect(res1.reasons).toContainEqual({
      code: ROOM_DOUBLE_BOOKED_CODE,
      message: ROOM_DOUBLE_BOOKED_MESSAGE,
    });

    // Existing overlaps by 1ms after candidate starts
    const startOverlap: ScheduleSlot = {
      id: "edge-overlap-2",
      roomId: "room-1",
      startMs: T0 - 30 * MIN + 1, // finishes at T0 + 1ms
      durationMinutes: 30,
      primaryPhysicianId: "doc-2",
    };

    const res2 = evaluateScheduleConflict(baseCandidate, [startOverlap]);
    expect(res2.ok).toBe(false);
    expect(res2.reasons).toContainEqual({
      code: ROOM_DOUBLE_BOOKED_CODE,
      message: ROOM_DOUBLE_BOOKED_MESSAGE,
    });
  });

  it("detects room double booking when rooms clash during time window", () => {
    const existing: ScheduleSlot = {
      id: "clash-room",
      roomId: "room-1",
      startMs: T0 + 10 * MIN,
      durationMinutes: 30,
      primaryPhysicianId: "doc-other",
      anesthesiologistId: "crna-other",
    };

    const result = evaluateScheduleConflict(baseCandidate, [existing]);
    expect(result.ok).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toEqual({
      code: ROOM_DOUBLE_BOOKED_CODE,
      message: ROOM_DOUBLE_BOOKED_MESSAGE,
    });
  });

  it("detects physician double booking when primary physician is in another room", () => {
    const existing: ScheduleSlot = {
      id: "clash-doc",
      roomId: "room-2", // different room!
      startMs: T0 + 15 * MIN,
      durationMinutes: 30,
      primaryPhysicianId: "doc-1", // same physician!
      anesthesiologistId: "crna-other",
    };

    const result = evaluateScheduleConflict(baseCandidate, [existing]);
    expect(result.ok).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toEqual({
      code: PHYSICIAN_DOUBLE_BOOKED_CODE,
      message: PHYSICIAN_DOUBLE_BOOKED_MESSAGE,
    });
  });

  it("detects anesthesia double booking when anesthesiologist is booked in another room", () => {
    const existing: ScheduleSlot = {
      id: "clash-anesthesia",
      roomId: "room-3", // different room
      startMs: T0,
      durationMinutes: 45,
      primaryPhysicianId: "doc-2", // different physician
      anesthesiologistId: "crna-1", // same anesthesia provider!
    };

    const result = evaluateScheduleConflict(baseCandidate, [existing]);
    expect(result.ok).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toEqual({
      code: ANESTHESIA_DOUBLE_BOOKED_CODE,
      message: ANESTHESIA_DOUBLE_BOOKED_MESSAGE,
    });
  });

  it("aggregates multiple simultaneous conflicts across room, physician, and anesthesia", () => {
    const existingSameRoomAndDoc: ScheduleSlot = {
      id: "clash-both",
      roomId: "room-1",
      startMs: T0 + 5 * MIN,
      durationMinutes: 20,
      primaryPhysicianId: "doc-1",
      anesthesiologistId: "crna-other",
    };

    const existingAnesthesiaOtherRoom: ScheduleSlot = {
      id: "clash-anesthesia-room2",
      roomId: "room-2",
      startMs: T0 + 10 * MIN,
      durationMinutes: 20,
      primaryPhysicianId: "doc-other",
      anesthesiologistId: "crna-1",
    };

    const result = evaluateScheduleConflict(baseCandidate, [
      existingSameRoomAndDoc,
      existingAnesthesiaOtherRoom,
    ]);

    expect(result.ok).toBe(false);
    expect(result.reasons).toHaveLength(3);
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toContain(ROOM_DOUBLE_BOOKED_CODE);
    expect(codes).toContain(PHYSICIAN_DOUBLE_BOOKED_CODE);
    expect(codes).toContain(ANESTHESIA_DOUBLE_BOOKED_CODE);
  });

  it("excludes cancelled and no-show cases from conflict calculations", () => {
    const cancelledCase: ScheduleSlot = {
      id: "cancelled-1",
      roomId: "room-1",
      startMs: T0,
      durationMinutes: 45,
      primaryPhysicianId: "doc-1",
      anesthesiologistId: "crna-1",
      status: "cancelled",
    };

    const noShowCase: ScheduleSlot = {
      id: "noshow-1",
      roomId: "room-1",
      startMs: T0,
      durationMinutes: 45,
      primaryPhysicianId: "doc-1",
      anesthesiologistId: "crna-1",
      status: "no_show",
    };

    const noShowHyphen: ScheduleSlot = {
      id: "noshow-2",
      roomId: "room-1",
      startMs: T0,
      durationMinutes: 45,
      primaryPhysicianId: "doc-1",
      anesthesiologistId: "crna-1",
      status: "no-show",
    };

    const result = evaluateScheduleConflict(baseCandidate, [
      cancelledCase,
      noShowCase,
      noShowHyphen,
    ]);

    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("ignores self case id when checking for conflicts", () => {
    const selfCase: ScheduleSlot = {
      id: "candidate-1", // same id as baseCandidate
      roomId: "room-1",
      startMs: T0,
      durationMinutes: 45,
      primaryPhysicianId: "doc-1",
      anesthesiologistId: "crna-1",
    };

    const result = evaluateScheduleConflict(baseCandidate, [selfCase]);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("does not report anesthesia conflict when candidate or existing has no anesthesiologist", () => {
    const candidateWithoutAnesthesia: ScheduleSlot = {
      ...baseCandidate,
      anesthesiologistId: undefined,
    };

    const existingWithAnesthesia: ScheduleSlot = {
      id: "existing-crna",
      roomId: "room-2",
      startMs: T0,
      durationMinutes: 45,
      primaryPhysicianId: "doc-other",
      anesthesiologistId: "crna-1",
    };

    const result = evaluateScheduleConflict(candidateWithoutAnesthesia, [existingWithAnesthesia]);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });
});
