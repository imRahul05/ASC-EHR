"use client";

import type { AuthzContext } from "@asc/authz";
import type { Capability } from "@asc/types";
import type { ReactNode } from "react";
import { useCan } from "../../hooks/use-can";

interface CanProps {
  /** One capability, or several meaning "any of these". */
  readonly capability: Capability | readonly Capability[];
  readonly context?: AuthzContext;
  readonly fallback?: ReactNode;
  readonly children: ReactNode;
}

/** Renders children only when the principal holds the capability. Convenience, not enforcement. */
export function Can({ capability, context, fallback = null, children }: CanProps) {
  const can = useCan();
  return can(capability, context) ? children : fallback;
}
