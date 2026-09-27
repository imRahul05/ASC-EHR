"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Skeleton } from "@asc/ui";
import { useAuth } from "../../hooks/use-auth";

/**
 * Client-side guard for signed-in areas while auth is mocked (P05 replaces it
 * with Medplum sign-in + server-side checks). Unauthenticated users go to /login.
 */
export function RequireAuth({ children }: { readonly children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  // Navigation is a side effect on an external system (the router) — a legitimate effect.
  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="p-6 space-y-3" data-testid="auth-redirecting">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return children;
}
