"use client";

import type { Capability } from "@asc/types";
import type { ReactNode } from "react";
import { useCan } from "../../hooks/use-can";
import { ForbiddenState } from "./forbidden-state";

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
  return <ForbiddenState />;
}
