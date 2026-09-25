import { initTelemetry } from "@repo/telemetry";
// Initialize telemetry before anything else
initTelemetry("api");

import { buildApp } from "./app.js";

const PORT = Number(process.env["PORT"] ?? 4000);
const HOST = process.env["HOST"] ?? "0.0.0.0";

async function start() {
  const app = buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error({ err }, "Failed to start server");
    process.exit(1);
  }
}

start();
