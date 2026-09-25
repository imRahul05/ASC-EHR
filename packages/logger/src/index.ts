import pino, { LoggerOptions } from "pino";

const isDev = process.env.NODE_ENV === "development";

// Redact sensitive headers, PHI fields, and full model outputs
const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "password",
  "token",
  "secret",
  "accessToken",
  "refreshToken",
  // Potential PHI/sensitive fields in request bodies or responses
  "patient.ssn",
  "patient.dob",
  "patient.address",
  "patient.contact",
  "resource.text",
  "resource.contained",
  "prompt",
  "modelOutput",
  "job.data.patientId", // keep min metadata, strip full objects if any
  "job.data.phi"
];

export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: redactPaths,
    censor: "[REDACTED]",
  },
  // In development, use pino-pretty. In production, use structured JSON.
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    },
  }),
};

// Create a singleton logger for generic/worker use
export const logger = pino(loggerOptions);

// Export type for convenience
export type Logger = pino.Logger;
