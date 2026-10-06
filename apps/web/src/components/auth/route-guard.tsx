"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCan } from "../../hooks/use-can";
import { accessForPath } from "../../lib/route-access";
import { ForbiddenState } from "./forbidden-state";

/**
 * Guards every signed-in screen from one table (lib/route-access.ts): a direct URL without the
 * capability at the current facility shows a 403 state, and a route missing from the table is
 * denied. Hiding a nav entry is not denial; this is. The API still enforces.
 */
export function RouteGuard({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const can = useCan();
  const required = accessForPath(pathname);

  if (required === null) return children;
  if (required === undefined || !can(required)) return <ForbiddenState />;
  return children;
}
