import { describe, expect, it } from "vitest";
import { initTelemetry, isTelemetryEnabled, shutdownTelemetry } from "./index.js";

describe("isTelemetryEnabled", () => {
  it("requires a deployed NODE_ENV and an OTLP endpoint", () => {
    expect(isTelemetryEnabled({})).toBe(false);
    expect(isTelemetryEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(
      isTelemetryEnabled({ NODE_ENV: "development", OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel:4318" }),
    ).toBe(false);
    expect(
      isTelemetryEnabled({ NODE_ENV: "staging", OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel:4318" }),
    ).toBe(true);
  });

  it("initTelemetry is a no-op when disabled and shutdown is safe", async () => {
    expect(initTelemetry("test", { NODE_ENV: "test" })).toBe(false);
    await expect(shutdownTelemetry()).resolves.toBeUndefined();
  });
});
