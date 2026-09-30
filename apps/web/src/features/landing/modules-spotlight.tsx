"use client";

import type { PointerEvent, ReactNode } from "react";

/** Mouse/pen only: write the pointer position inside the hovered card to `--mx` / `--my`. */
function trackPointer(event: PointerEvent<HTMLUListElement>) {
  if (event.pointerType === "touch" || !(event.target instanceof Element)) return;
  const card = event.target.closest<HTMLElement>("li");
  if (!card || !event.currentTarget.contains(card)) return;
  const rect = card.getBoundingClientRect();
  card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  card.style.setProperty("--my", `${event.clientY - rect.top}px`);
}

/**
 * The modules `<ul>` with one delegated pointer handler feeding the per-card spotlight.
 * Cards stay server-rendered; the gradient itself is CSS in `modules-section.tsx`.
 */
export function ModulesSpotlightList({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <ul className={className} onPointerMove={trackPointer}>
      {children}
    </ul>
  );
}
