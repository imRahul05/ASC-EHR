"use client";

import type { Capability } from "@asc/types";
import { ErrorState } from "@asc/ui/components/clinical/error-state";
import type { ReactNode } from "react";
import { useCan } from "../../hooks/use-can";

interface RequireCapabilityProps {
  /** One capability, or several meaning "any of these". */
  readonly capability: Capability | readonly Capability[];
  readonly children: ReactNode;
}

/**
 * Route guard: shows a 403 state instead of the screen when the principal lacks the
 * capability at the current facility. The API still enforces; this avoids a dead screen.
 */
export function RequireCapability({ capability, children }: RequireCapabilityProps) {
  const can = useCan();
  if (can(capability)) return children;
  return (
    <div data-testid="forbidden-state" data-status="403">
      <ErrorState
        title="You don't have access to this screen"
        message="Your role at this facility doesn't include it. Ask an administrator if you need access."
      />
    </div>
  );
}
