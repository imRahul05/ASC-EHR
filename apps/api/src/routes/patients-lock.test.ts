import { describe, expect, it } from "vitest";

import { withFacilityRegistrationLock } from "./patients.js";

describe("withFacilityRegistrationLock", () => {
  it("serializes concurrent operations targeting the same facility", async () => {
    const timeline: string[] = [];

    const op1 = () =>
      withFacilityRegistrationLock("fac-serial", async () => {
        timeline.push("op1:start");
        await new Promise((resolve) => setTimeout(resolve, 30));
        timeline.push("op1:end");
        return "res1";
      });

    const op2 = () =>
      withFacilityRegistrationLock("fac-serial", async () => {
        timeline.push("op2:start");
        await Promise.resolve();
        timeline.push("op2:end");
        return "res2";
      });

    const [r1, r2] = await Promise.all([op1(), op2()]);

    expect(r1).toBe("res1");
    expect(r2).toBe("res2");
    expect(timeline).toEqual(["op1:start", "op1:end", "op2:start", "op2:end"]);
  });

  it("allows operations targeting different facilities to execute concurrently", async () => {
    const timeline: string[] = [];

    const opA = () =>
      withFacilityRegistrationLock("fac-a", async () => {
        timeline.push("opA:start");
        await new Promise((resolve) => setTimeout(resolve, 30));
        timeline.push("opA:end");
        return "resA";
      });

    const opB = () =>
      withFacilityRegistrationLock("fac-b", async () => {
        timeline.push("opB:start");
        await Promise.resolve();
        timeline.push("opB:end");
        return "resB";
      });

    const [rA, rB] = await Promise.all([opA(), opB()]);

    expect(rA).toBe("resA");
    expect(rB).toBe("resB");
    // opB should start and finish before opA finishes its 30ms sleep
    expect(timeline).toEqual(["opA:start", "opB:start", "opB:end", "opA:end"]);
  });

  it("recovers and unblocks subsequent queued operations when an in-flight operation throws", async () => {
    let secondRan = false;

    const failingOp = () =>
      withFacilityRegistrationLock("fac-err", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error("simulated failure");
      });

    const succeedingOp = () =>
      withFacilityRegistrationLock("fac-err", async () => {
        await Promise.resolve();
        secondRan = true;
        return "ok";
      });

    const results = await Promise.allSettled([failingOp(), succeedingOp()]);

    expect(results[0]?.status).toBe("rejected");
    expect(results[1]?.status).toBe("fulfilled");
    if (results[1]?.status === "fulfilled") {
      expect(results[1].value).toBe("ok");
    }
    expect(secondRan).toBe(true);
  });
});
