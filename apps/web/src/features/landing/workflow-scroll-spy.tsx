"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@asc/ui";

/** Index of the step crossing the middle of the viewport, or null before the list is reached. */
const ActiveStepContext = createContext<number | null>(null);

const STEP_SELECTOR = "[data-step-index]";

/** Watches the list's steps against a one-pixel band at the viewport's middle. */
function useActiveStep(listRef: RefObject<HTMLOListElement | null>) {
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.stepIndex);
          if (entry.isIntersecting) {
            setActive(index);
          } else if (index === 0 && entry.rootBounds && entry.boundingClientRect.top > entry.rootBounds.top) {
            // Scrolled back above the first step: nothing is active yet.
            setActive(null);
          }
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    list.querySelectorAll(STEP_SELECTOR).forEach((step) => observer.observe(step));
    return () => observer.disconnect();
  }, [listRef]);

  return active;
}

/** The workflow's ordered list; tracks which step the reader is on. */
export function WorkflowScrollSpy({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  const listRef = useRef<HTMLOListElement>(null);
  const active = useActiveStep(listRef);

  return (
    <ActiveStepContext.Provider value={active}>
      <ol ref={listRef} className={className}>
        {children}
      </ol>
    </ActiveStepContext.Provider>
  );
}

/** One step; exposes `data-state` (done / active / upcoming) so its parts style themselves with `group-data-[state=…]/step:` variants. */
export function WorkflowStepItem({
  id,
  index,
  className,
  children,
}: {
  readonly id: string;
  readonly index: number;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const active = useContext(ActiveStepContext);
  const state = active === null || index > active ? "upcoming" : index === active ? "active" : "done";

  return (
    <li id={id} data-step-index={index} data-state={state} className={cn("group/step", className)}>
      {children}
    </li>
  );
}
