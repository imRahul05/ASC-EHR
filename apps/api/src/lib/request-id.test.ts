import { describe, expect, it } from "vitest";
import { REQUEST_ID_PATTERN, resolveRequestId } from "./request-id.js";

const generate = () => "generated-id";

describe("resolveRequestId", () => {
  it("accepts a well-formed x-correlation-id", () => {
    expect(resolveRequestId({ "x-correlation-id": "abc-123:DEF.4_5" }, generate)).toBe(
      "abc-123:DEF.4_5",
    );
  });

  it("falls back to x-request-id when correlation id is absent", () => {
    expect(resolveRequestId({ "x-request-id": "req-1" }, generate)).toBe("req-1");
  });

  it("prefers x-correlation-id over x-request-id", () => {
    expect(resolveRequestId({ "x-correlation-id": "corr", "x-request-id": "req" }, generate)).toBe(
      "corr",
    );
  });

  it("rejects values that could inject into logs", () => {
    for (const bad of [
      "abc\ninjected",
      "abc def",
      '{"level":"error"}',
      "",
      "a".repeat(129),
      "<script>",
    ]) {
      expect(resolveRequestId({ "x-correlation-id": bad }, generate)).toBe("generated-id");
    }
  });

  it("skips an invalid correlation id but uses a valid request id", () => {
    expect(resolveRequestId({ "x-correlation-id": "bad value", "x-request-id": "ok-1" }, generate)).toBe(
      "ok-1",
    );
  });

  it("uses the first value of a repeated header", () => {
    expect(resolveRequestId({ "x-request-id": ["first", "second"] }, generate)).toBe("first");
  });

  it("generates a UUID by default", () => {
    const id = resolveRequestId({});
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(REQUEST_ID_PATTERN.test(id)).toBe(true);
  });

  it("accepts exactly 128 characters", () => {
    const max = "a".repeat(128);
    expect(resolveRequestId({ "x-request-id": max }, generate)).toBe(max);
  });
});
