import { SpanProcessor, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { NodeSDK } from "@opentelemetry/sdk-node";

const SENSITIVE_KEYS = [
  "authorization", "cookie", "x-api-key", "password", "token", "secret", 
  "accessToken", "refreshToken", "patient.ssn", "patient.dob", "patient.address",
  "patient.contact", "resource.text", "resource.contained", "prompt", "modelOutput", "job.data.phi"
];

// Simple redaction processor for OpenTelemetry spans
export class RedactingSpanProcessor implements SpanProcessor {
  constructor(private delegate: SpanProcessor) {}

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush();
  }
  
  onStart(span: any, parentContext: any): void {
    if (this.delegate.onStart) {
      this.delegate.onStart(span, parentContext);
    }
  }

  onEnd(span: ReadableSpan): void {
    // Redact attributes before they are exported
    const attributes = span.attributes;
    for (const key of Object.keys(attributes)) {
      if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        (span as any).attributes[key] = "[REDACTED]";
      }
    }
    
    if (this.delegate.onEnd) {
      this.delegate.onEnd(span);
    }
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
}

export function initTelemetry(serviceName: string) {
  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "staging") {
    // Do not initialize OTel in local development
    return;
  }

  // Example basic NodeSDK setup, avoiding adding heavy azure deps yet.
  // The actual exporter (Azure Monitor, OTLP, etc) would be configured here.
  const sdk = new NodeSDK({
    serviceName,
    // spanProcessor: new RedactingSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter()))
  });

  sdk.start();
  
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.log('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
}
