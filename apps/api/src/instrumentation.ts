/**
 * Preloaded via `node --import ./dist/instrumentation.js` (or `tsx --import`)
 * so OpenTelemetry is registered BEFORE Fastify or any other module loads.
 * ESM hoists static imports, so this cannot live at the top of server.ts.
 */
import { initTelemetry } from "@asc/telemetry";

initTelemetry("api");
