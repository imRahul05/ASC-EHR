"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CasePhase } from "@asc/types";
import { DEFAULT_TAB_BY_PHASE, isCaseTab } from "./case-tabs";

/** Active case tab lives in the URL (`?tab=`, IDs only — never PHI). */
export function useCaseTab(phase: CasePhase | undefined) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = searchParams.get("tab");
  const tab = isCaseTab(requested) ? requested : DEFAULT_TAB_BY_PHASE[phase ?? "SCHEDULED"];

  const setTab = (next: string) => {
    if (!isCaseTab(next)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return { tab, setTab };
}
