import { SpanKind, SpanStatusCode, TraceFlags } from "@opentelemetry/api";
import type { ExportResult } from "@opentelemetry/core";
import { ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it, vi } from "vitest";
import {
  isSensitiveAttributeKey,
  REDACTED,
  RedactingSpanExporter,
} from "./redacting-exporter.js";

function makeSpan(overrides: Partial<ReadableSpan> = {}): ReadableSpan {
  const spanContext = { traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: TraceFlags.SAMPLED };
  return {
    name: "GET /patients/:id",
    kind: SpanKind.SERVER,
    spanContext: () => spanContext,
    startTime: [0, 0],
    endTime: [1, 0],
    status: { code: SpanStatusCode.OK },
    attributes: {},
    links: [],
    events: [],
    duration: [1, 0],
    ended: true,
    resource: {
      attributes: {},
      merge: () => {
        throw new Error("not used");
      },
    },
    instrumentationLibrary: { name: "test" },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    ...overrides,
  };
}

class CapturingExporter implements SpanExporter {
  exported: ReadableSpan[] = [];
  shutdown = vi.fn(() => Promise.resolve());
  forceFlush = vi.fn(() => Promise.resolve());
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    this.exported.push(...spans);
    resultCallback({ code: ExportResultCode.SUCCESS });
  }
}

function exportOne(span: ReadableSpan): { exported: ReadableSpan; result: ExportResult | undefined } {
  const delegate = new CapturingExporter();
  const exporter = new RedactingSpanExporter(delegate);
  let result: ExportResult | undefined;
  exporter.export([span], (r) => {
    result = r;
  });
  const exported = delegate.exported[0];
  if (!exported) throw new Error("nothing exported");
  return { exported, result };
}

describe("isSensitiveAttributeKey", () => {
  it("matches whole dotted segments case-insensitively", () => {
    expect(isSensitiveAttributeKey("http.request.header.Authorization")).toBe(true);
    expect(isSensitiveAttributeKey("patient.SSN")).toBe(true);
    expect(isSensitiveAttributeKey("user.accessToken")).toBe(true);
    expect(isSensitiveAttributeKey("DB.Statement")).toBe(true);
    expect(isSensitiveAttributeKey("fhir.Resource.Text")).toBe(true);
  });

  it("does not match unrelated keys that merely contain a sensitive word", () => {
    expect(isSensitiveAttributeKey("gen_ai.usage.input_tokens")).toBe(false);
    expect(isSensitiveAttributeKey("http.route")).toBe(false);
    expect(isSensitiveAttributeKey("db.system")).toBe(false);
    expect(isSensitiveAttributeKey("resource.type")).toBe(false);
  });
});

describe("RedactingSpanExporter", () => {
  it("redacts nested and case-insensitive keys and passes others through", () => {
    const original = makeSpan({
      attributes: {
        "http.request.header.authorization": "Bearer abc",
        "Patient.DOB": "1970-01-01",
        "db.statement": "SELECT * FROM patients WHERE ssn = '123'",
        "http.method": "GET",
        "http.status_code": 200,
      },
    });

    const { exported } = exportOne(original);

    expect(exported.attributes).toEqual({
      "http.request.header.authorization": REDACTED,
      "Patient.DOB": REDACTED,
      "db.statement": REDACTED,
      "http.method": "GET",
      "http.status_code": 200,
    });
    expect(exported.name).toBe(original.name);
    expect(exported.spanContext()).toEqual(original.spanContext());
  });

  it("does not mutate the original span", () => {
    const original = makeSpan({ attributes: { "user.email": "a@example.com" } });
    const { exported } = exportOne(original);
    expect(original.attributes["user.email"]).toBe("a@example.com");
    expect(exported.attributes["user.email"]).toBe(REDACTED);
    expect(exported).not.toBe(original);
  });

  it("redacts event and link attributes", () => {
    const original = makeSpan({
      events: [{ name: "llm.call", time: [0, 0], attributes: { prompt: "patient has...", model: "x" } }],
      links: [
        {
          context: linkContext(),
          attributes: { Transcript: "…", kind: "follows" },
        },
      ],
    });
    const { exported } = exportOne(original);
    expect(exported.events[0]?.attributes).toEqual({ prompt: REDACTED, model: "x" });
    expect(exported.links[0]?.attributes).toEqual({ Transcript: REDACTED, kind: "follows" });
  });

  it("passes spans without sensitive attributes through unchanged", () => {
    const original = makeSpan({ attributes: { "http.route": "/health" } });
    const { exported } = exportOne(original);
    expect(exported).toBe(original);
  });

  it("delegates the export result, shutdown and forceFlush", async () => {
    const delegate = new CapturingExporter();
    const exporter = new RedactingSpanExporter(delegate);
    const callback = vi.fn();
    exporter.export([makeSpan()], callback);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });

    await exporter.forceFlush();
    await exporter.shutdown();
    expect(delegate.forceFlush).toHaveBeenCalledOnce();
    expect(delegate.shutdown).toHaveBeenCalledOnce();
  });
});

function linkContext() {
  return { traceId: "c".repeat(32), spanId: "d".repeat(16), traceFlags: TraceFlags.SAMPLED };
}
