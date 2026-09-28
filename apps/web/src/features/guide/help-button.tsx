"use client";

import { useEffect } from "react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@asc/ui";
import { CircleHelp } from "@asc/ui/icons";
import { updateGuide } from "./guide-store";

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (TYPING_TAGS.has(target.tagName) || target.isContentEditable);
}

/** Top-bar "?" — opens help for the current page. Also bound to the `?` key (ignored while typing). */
export function HelpButton() {
  // Global shortcut: subscribing to a browser event is a legitimate effect.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || isTyping(event.target)) return;
      event.preventDefault();
      updateGuide((prev) => ({ helpOpen: !prev.helpOpen }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => updateGuide({ helpOpen: true })} aria-label="Help for this page (?)" aria-keyshortcuts="?" data-testid="help-button">
            <CircleHelp className="size-4" />
          </Button>
        }
      />
      <TooltipContent>Help for this page · ?</TooltipContent>
    </Tooltip>
  );
}
