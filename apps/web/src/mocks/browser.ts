import { setupWorker } from "msw/browser";
import { authHandlers } from "./handlers/auth";
import { clinicalHandlers } from "./handlers/clinical";
import { meHandlers } from "./handlers/me";

/**
 * Dev-only fake apps/api. @asc/api-client makes real fetch calls; this service
 * worker answers them from the in-memory demo DB (./db) until the real endpoints
 * exist. Synthetic data only; a full reload re-seeds.
 */
export const worker = setupWorker(...authHandlers, ...meHandlers, ...clinicalHandlers);
