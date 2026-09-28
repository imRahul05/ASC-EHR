"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UserRole } from "@asc/types";
import { toast } from "@asc/ui";
import { ROLE_LABEL } from "@/components/shell/nav-config";
import { useAuth } from "@/hooks/use-auth";

/**
 * "Take me there": switch demo persona in-app if needed (no reload — the session is in memory),
 * then navigate. `pendingKey` marks the button in flight.
 */
export function useGoTo() {
  const router = useRouter();
  const { user, switchRole } = useAuth();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const goTo = async (role: UserRole, href: string, key: string = href) => {
    setPendingKey(key);
    try {
      if (user?.role !== role) {
        await switchRole(role);
        toast.success(`Now viewing as ${ROLE_LABEL[role].label}`);
      }
      // switchRole routes to the persona's home first; this push wins.
      router.push(href);
    } catch {
      toast.error("Could not switch persona. Try again.");
    } finally {
      setPendingKey(null);
    }
  };

  return { goTo, pendingKey, role: user?.role ?? null };
}
