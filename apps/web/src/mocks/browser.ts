import { setupWorker } from "msw/browser";
import { authHandlers } from "./handlers/auth";
import { dashboardHandlers } from "./handlers/dashboard";

/**
 * Dev-only fake apps/api. @asc/api-client makes real fetch calls; this service
 * worker answers them until the real endpoints exist. Synthetic data only.
 */
export const worker = setupWorker(...authHandlers, ...dashboardHandlers);
