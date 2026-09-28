"use client";

import { HintStrip } from "@asc/ui";
import { CASE_TAB_HELP } from "./guide-content";
import { hideHint, openHelp, useGuideState } from "./guide-store";

interface TabHintProps {
  readonly tabId: string;
}

/** "How this tab works" strip at the top of a case tab; hidden per tab once dismissed (UI preference). */
export function TabHint({ tabId }: TabHintProps) {
  const { hiddenHints } = useGuideState();
  const help = CASE_TAB_HELP[tabId];
  const hintId = `tab:${tabId}`;
  if (!help || hiddenHints.includes(hintId)) return null;

  return (
    <HintStrip title="How this tab works" onDismiss={() => hideHint(hintId)} actionLabel="More help" onAction={openHelp} className="mb-4" data-testid={`tab-hint-${tabId}`}>
      {help.hint}
    </HintStrip>
  );
}
