import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { RedactingSpanExporter } from "./redacting-exporter.js";

export {
  REDACTED,
  RedactingSpanExporter,
  SENSITIVE_ATTRIBUTE_KEYS,
  isSensitiveAttributeKey,
  redactAttributes,
  redactSpan,
} from "./redacting-exporter.js";

type TelemetryEnv = Readonly<Record<string, string | undefined>>;

let sdk: NodeSDK | undefined;

/** Tracing is exported only from deployed environments with a configured collector. */
export function isTelemetryEnabled(env: TelemetryEnv = process.env): boolean {
  const nodeEnv = env["NODE_ENV"];
  const endpoint = env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  return (
    (nodeEnv === "production" || nodeEnv === "staging") &&
    typeof endpoint === "string" &&
    endpoint.length > 0
  );
}

/**
 * Start OpenTelemetry tracing. Must run before any instrumented module is
 * imported — call it from the app's `src/instrumentation.ts` preload
 * (`node --import ./dist/instrumentation.js ...`).
 *
 * No-op unless NODE_ENV is production/staging AND OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * Every span passes through RedactingSpanExporter before leaving the process.
 * Returns true when tracing was started.
 */
export function initTelemetry(serviceName: string, env: TelemetryEnv = process.env): boolean {
  if (sdk || !isTelemetryEnabled(env)) {
    return false;
  }

  sdk = new NodeSDK({
    serviceName,
    spanProcessors: [new BatchSpanProcessor(new RedactingSpanExporter(new OTLPTraceExporter()))],
  });
  sdk.start();
  return true;
}

/**
 * Flush and stop tracing. Safe to call when telemetry was never started.
 * Never throws: resolves to the shutdown error (if any) so the caller can log
 * it with @asc/logger.
 */
export async function shutdownTelemetry(): Promise<Error | undefined> {
  const current = sdk;
  sdk = undefined;
  if (!current) {
    return undefined;
  }
  try {
    await current.shutdown();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error("Telemetry shutdown failed");
  }
}
