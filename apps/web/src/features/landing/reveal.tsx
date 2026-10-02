"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@asc/ui/lib/utils";
import { canAnimateOnScroll, observeOnceInView } from "./reveal-observer";

interface RevealProps {
  readonly children: ReactNode;
  /** Extra transition delay in ms, for staggering neighbours. */
  readonly delay?: number;
  readonly className?: string;
}

/**
 * Fades children up 12px the first time they scroll into view.
 *
 * Content is visible in the server HTML; the hidden state is only set after mount, and only for
 * elements still below the fold, so no-JS, above-the-fold and reduced-motion visitors never see it.
 * State lives in a `data-reveal` attribute written straight to the DOM (no re-render). The offset
 * uses `translate`, so layout never shifts.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !canAnimateOnScroll(el)) return;
    el.dataset.reveal = "hidden";
    return observeOnceInView(el, () => {
      el.dataset.reveal = "shown";
    });
  }, []);

  return (
    <div
      ref={ref}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
      className={cn(
        "data-[reveal=hidden]:translate-y-3 data-[reveal=hidden]:opacity-0",
        "data-[reveal=shown]:transition-[opacity,translate] data-[reveal=shown]:delay-(--reveal-delay) data-[reveal=shown]:duration-700 data-[reveal=shown]:ease-out",
        "motion-reduce:transition-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
