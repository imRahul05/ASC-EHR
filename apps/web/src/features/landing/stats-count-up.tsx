"use client";

import { useEffect, useRef } from "react";
import { canAnimateOnScroll, observeOnceInView } from "./reveal-observer";

const DURATION_MS = 900;

/** Cubic ease-out: fast start, gentle landing. */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Split "< 10 s" into prefix "< ", number 10 and suffix " s". */
function parseStat(value: string) {
  const match = /^(\D*)(\d+)(.*)$/.exec(value);
  return match ? { prefix: match[1] ?? "", target: Number(match[2]), digits: match[2]?.length ?? 1, suffix: match[3] ?? "" } : null;
}

/** Tween `el.textContent` from 0 to `target`; returns a cancel function. */
function tween(el: HTMLElement, target: number) {
  let frame = 0;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min((now - start) / DURATION_MS, 1);
    el.textContent = String(Math.round(target * easeOut(t)));
    if (t < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}

/**
 * A stat value whose number counts up once when it first scrolls into view.
 *
 * The server HTML carries the final value, so no-JS, above-the-fold and reduced-motion visitors see it
 * as is. Screen readers get the final value from a visually-hidden copy; the animated digits are
 * `aria-hidden`. The number box is sized in `ch` (with tabular-nums) so the width never jumps.
 */
export function StatsCountUp({ value }: { readonly value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const stat = parseStat(value);
  const target = stat?.target ?? 0;

  useEffect(() => {
    const el = ref.current;
    if (!el || target === 0 || !canAnimateOnScroll(el)) return;
    el.textContent = "0";
    let cancelTween: (() => void) | undefined;
    const stopObserving = observeOnceInView(el, () => {
      cancelTween = tween(el, target);
    });
    return () => {
      stopObserving();
      cancelTween?.();
    };
  }, [target]);

  if (!stat) return value;

  return (
    <>
      <span className="sr-only">{value}</span>
      <span aria-hidden>
        {stat.prefix}
        <span ref={ref} className="inline-block text-right" style={{ minWidth: `${stat.digits}ch` }}>
          {stat.target}
        </span>
        {stat.suffix}
      </span>
    </>
  );
}
