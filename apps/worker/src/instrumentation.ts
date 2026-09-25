/**
 * Preloaded via `node --import ./dist/instrumentation.js` (or `tsx --import`)
 * so OpenTelemetry is registered BEFORE BullMQ/ioredis or any other module loads.
 */
import { initTelemetry } from "@asc/telemetry";

initTelemetry("worker");
