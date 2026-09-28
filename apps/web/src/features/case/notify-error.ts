import { ApiError } from "@asc/api-client";
import { toast } from "@asc/ui";

/** Toast for a failed command: the API's message (gate reasons, conflicts), never raw server text otherwise. */
export function notifyError(fallback: string) {
  return (error: unknown) => toast.error(error instanceof ApiError ? error.message : fallback);
}
