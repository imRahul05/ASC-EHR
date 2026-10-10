import { describe, expect, it, vi } from "vitest";
import {
  createSessionActivityTracker,
  DEFAULT_ABSOLUTE_TIMEOUT_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
} from "./use-session-timeout";

describe("createSessionActivityTracker", () => {
  it("uses default timeout values (15 min idle, 12 h absolute)", () => {
    expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);
    expect(DEFAULT_ABSOLUTE_TIMEOUT_MS).toBe(12 * 60 * 60 * 1000);
  });

  it("does not timeout before idle limit", () => {
    let fakeNow = 1_000_000;
    const onTimeout = vi.fn();

    const tracker = createSessionActivityTracker({
      idleTimeoutMs: 10_000,
      absoluteTimeoutMs: 60_000,
      sessionStartedAt: fakeNow,
      onTimeout,
      now: () => fakeNow,
    });

    fakeNow += 5_000;
    tracker.check();
    expect(onTimeout).not.toHaveBeenCalled();
    expect(tracker.isTimedOut()).toBe(false);
  });

  it("triggers idle timeout after inactivity", () => {
    let fakeNow = 1_000_000;
    const onTimeout = vi.fn();

    const tracker = createSessionActivityTracker({
      idleTimeoutMs: 10_000,
      absoluteTimeoutMs: 60_000,
      sessionStartedAt: fakeNow,
      onTimeout,
      now: () => fakeNow,
    });

    fakeNow += 10_001;
    tracker.check();
    expect(onTimeout).toHaveBeenCalledWith("idle");
    expect(tracker.isTimedOut()).toBe(true);

    // Further checks do not re-trigger
    fakeNow += 10_000;
    tracker.check();
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("resets idle timer on user activity", () => {
    let fakeNow = 1_000_000;
    const onTimeout = vi.fn();

    const tracker = createSessionActivityTracker({
      idleTimeoutMs: 10_000,
      absoluteTimeoutMs: 60_000,
      sessionStartedAt: fakeNow,
      onTimeout,
      now: () => fakeNow,
    });

    fakeNow += 8_000;
    tracker.check();
    expect(onTimeout).not.toHaveBeenCalled();

    // User interacts
    tracker.recordActivity();

    // 8 seconds after interaction (16 seconds total since session start)
    fakeNow += 8_000;
    tracker.check();
    expect(onTimeout).not.toHaveBeenCalled();

    // 10+ seconds after interaction
    fakeNow += 3_000;
    tracker.check();
    expect(onTimeout).toHaveBeenCalledWith("idle");
  });

  it("triggers absolute timeout after max duration even with continuous activity", () => {
    let fakeNow = 1_000_000;
    const sessionStart = fakeNow;
    const onTimeout = vi.fn();

    const tracker = createSessionActivityTracker({
      idleTimeoutMs: 10_000,
      absoluteTimeoutMs: 30_000,
      sessionStartedAt: sessionStart,
      onTimeout,
      now: () => fakeNow,
    });

    // Continuous activity every 5 seconds
    for (let i = 0; i < 5; i++) {
      fakeNow += 5_000;
      tracker.recordActivity();
      tracker.check();
      expect(onTimeout).not.toHaveBeenCalled();
    }

    // Now fakeNow is 25_000 past start. Advance by 6_000 (total 31_000 past start)
    fakeNow += 6_000;
    tracker.recordActivity();
    tracker.check();
    expect(onTimeout).toHaveBeenCalledWith("absolute");
    expect(tracker.isTimedOut()).toBe(true);
  });

  it("handles null sessionStartedAt without throwing", () => {
    let fakeNow = 1_000_000;
    const onTimeout = vi.fn();

    const tracker = createSessionActivityTracker({
      idleTimeoutMs: 10_000,
      absoluteTimeoutMs: 30_000,
      sessionStartedAt: null,
      onTimeout,
      now: () => fakeNow,
    });

    fakeNow += 5_000;
    tracker.check();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("supports external activity getters and setters to preserve state across re-renders", () => {
    let fakeNow = 1_000_000;
    let storedActivity = fakeNow;
    const onTimeout = vi.fn();

    const tracker = createSessionActivityTracker({
      idleTimeoutMs: 10_000,
      absoluteTimeoutMs: 30_000,
      sessionStartedAt: fakeNow,
      getLastActivityAt: () => storedActivity,
      setLastActivityAt: (time: number) => {
        storedActivity = time;
      },
      onTimeout,
      now: () => fakeNow,
    });

    fakeNow += 4_000;
    tracker.recordActivity();
    expect(storedActivity).toBe(1_004_000);

    // Recreate tracker as would happen in a component effect with preserved ref
    const recreatedTracker = createSessionActivityTracker({
      idleTimeoutMs: 10_000,
      absoluteTimeoutMs: 30_000,
      sessionStartedAt: 1_000_000,
      getLastActivityAt: () => storedActivity,
      setLastActivityAt: (time: number) => {
        storedActivity = time;
      },
      onTimeout,
      now: () => fakeNow,
    });

    // 8 seconds after activity recorded (total 12 seconds from initial start)
    fakeNow += 8_000;
    recreatedTracker.check();
    expect(onTimeout).not.toHaveBeenCalled();

    // 11 seconds after activity recorded
    fakeNow += 3_000;
    recreatedTracker.check();
    expect(onTimeout).toHaveBeenCalledWith("idle");
  });
});
