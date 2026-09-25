import type { Attributes, Link } from "@opentelemetry/api";
import type { ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter, TimedEvent } from "@opentelemetry/sdk-trace-base";

export const REDACTED = "[REDACTED]";

/**
 * Attribute keys (or dotted key segments) that may carry secrets or PHI.
 * Matched case-insensitively. Multi-segment entries (e.g. "db.statement")
 * match when they appear as a contiguous dotted run in the attribute key.
 */
export const SENSITIVE_ATTRIBUTE_KEYS: readonly string[] = [
  "authorization",
  "cookie",
  "x-api-key",
  "password",
  "token",
  "secret",
  "accesstoken",
  "refreshtoken",
  "ssn",
  "dob",
  "birthdate",
  "address",
  "telecom",
  "phone",
  "email",
  "prompt",
  "modeloutput",
  "transcript",
  "resource.text",
  "resource.contained",
  "http.request.body",
  "db.statement",
];

const SENSITIVE_SEGMENT_RUNS: readonly (readonly string[])[] = SENSITIVE_ATTRIBUTE_KEYS.map(
  (key) => key.toLowerCase().split("."),
);

/**
 * True when any sensitive entry appears as a whole dotted-segment run of `key`.
 * e.g. "http.request.header.authorization" matches "authorization",
 * "Patient.SSN" matches "ssn", but "gen_ai.usage.input_tokens" does NOT match "token".
 */
export function isSensitiveAttributeKey(key: string): boolean {
  const segments = key.toLowerCase().split(".");
  return SENSITIVE_SEGMENT_RUNS.some((run) => {
    for (let start = 0; start + run.length <= segments.length; start++) {
      if (run.every((part, offset) => segments[start + offset] === part)) {
        return true;
      }
    }
    return false;
  });
}

/** Returns a redacted copy, or the same object when nothing needed redaction. */
export function redactAttributes<T extends Attributes>(attributes: T): T {
  let copy: Attributes | undefined;
  for (const key of Object.keys(attributes)) {
    if (isSensitiveAttributeKey(key)) {
      copy ??= { ...attributes };
      copy[key] = REDACTED;
    }
  }
  return (copy ?? attributes) as T;
}

function redactEvents(events: TimedEvent[]): TimedEvent[] {
  let changed = false;
  const next = events.map((event) => {
    if (!event.attributes) return event;
    const attributes = redactAttributes(event.attributes);
    if (attributes === event.attributes) return event;
    changed = true;
    return { ...event, attributes };
  });
  return changed ? next : events;
}

function redactLinks(links: Link[]): Link[] {
  let changed = false;
  const next = links.map((link) => {
    if (!link.attributes) return link;
    const attributes = redactAttributes(link.attributes);
    if (attributes === link.attributes) return link;
    changed = true;
    return { ...link, attributes };
  });
  return changed ? next : links;
}

/**
 * Returns a span safe to export. The original (read-only) span is never mutated;
 * a shallow copy with redacted attributes/events/links is produced when needed.
 */
export function redactSpan(span: ReadableSpan): ReadableSpan {
  const attributes = redactAttributes(span.attributes);
  const events = redactEvents(span.events);
  const links = redactLinks(span.links);
  if (attributes === span.attributes && events === span.events && links === span.links) {
    return span;
  }
  return {
    name: span.name,
    kind: span.kind,
    spanContext: () => span.spanContext(),
    parentSpanId: span.parentSpanId,
    startTime: span.startTime,
    endTime: span.endTime,
    status: span.status,
    attributes,
    links,
    events,
    duration: span.duration,
    ended: span.ended,
    resource: span.resource,
    instrumentationLibrary: span.instrumentationLibrary,
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
  };
}

/**
 * SpanExporter decorator: redacts sensitive attributes on copies of each span,
 * then delegates to the wrapped exporter (e.g. OTLPTraceExporter).
 */
export class RedactingSpanExporter implements SpanExporter {
  readonly #delegate: SpanExporter;

  constructor(delegate: SpanExporter) {
    this.#delegate = delegate;
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    this.#delegate.export(spans.map(redactSpan), resultCallback);
  }

  shutdown(): Promise<void> {
    return this.#delegate.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.#delegate.forceFlush ? this.#delegate.forceFlush() : Promise.resolve();
  }
}
