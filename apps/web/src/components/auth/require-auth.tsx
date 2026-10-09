"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Skeleton } from "@asc/ui/components/ui/skeleton";
import { useAuth } from "../../hooks/use-auth";
import { useSessionTimeout } from "../../hooks/use-session-timeout";

/**
 * Client-side guard for signed-in areas while auth is mocked (P05 replaces it
 * with Medplum sign-in + server-side checks). Unauthenticated users go to /login.
 */
export function RequireAuth({ children }: { readonly children: ReactNode }) {
  const { isAuthenticated, restoreSession } = useAuth();
  const router = useRouter();

  useSessionTimeout();

  // Navigation and silent session restore are side effects on external systems.
  useEffect(() => {
    if (isAuthenticated) return;

    let isMounted = true;
    void restoreSession().then((restored) => {
      if (!isMounted) return;
      if (!restored) {
        router.replace("/login");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, restoreSession, router]);

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
