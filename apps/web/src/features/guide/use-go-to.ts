"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DemoPersonaId } from "@asc/types";
import { toast } from "@asc/ui";
import { useAuth, useCurrentPersona } from "@/hooks/use-auth";
import { PERSONAS } from "@/lib/personas";

/**
 * "Take me there": switch demo persona in-app if needed (no reload — the session is in memory),
 * then navigate. `pendingKey` marks the button in flight.
 */
export function useGoTo() {
  const router = useRouter();
  const { switchPersona } = useAuth();
  const persona = useCurrentPersona();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const goTo = async (target: DemoPersonaId, href: string, key: string = href) => {
    setPendingKey(key);
    try {
      if (persona !== target) {
        await switchPersona(target);
        toast.success(`Now viewing as ${PERSONAS[target].label}`);
      }
      // switchPersona routes to the persona's home first; this push wins.
      router.push(href);
    } catch {
      toast.error("Could not switch persona. Try again.");
    } finally {
      setPendingKey(null);
    }
  };

  return { goTo, pendingKey, persona };
}
