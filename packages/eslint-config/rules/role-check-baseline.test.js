import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROLE_CHECK_BASELINE } from "../role-check-baseline.js";

describe("role-name check baseline", () => {
  it("stays empty: no file may be exempt from asc/no-role-name-comparison (P05 acceptance)", () => {
    assert.deepEqual(ROLE_CHECK_BASELINE, []);
  });
});
