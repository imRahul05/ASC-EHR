/** True when the user asked the OS for less motion. */
export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True when any part of the element is inside the viewport right now. */
export function isInViewport(el: Element) {
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

/** True when a scroll-in animation should run: motion allowed, observer supported, element still off-screen. */
export function canAnimateOnScroll(el: Element) {
  return !prefersReducedMotion() && "IntersectionObserver" in window && !isInViewport(el);
}

/**
 * Call `onEnter` once, the first time `el` scrolls into view, then stop observing.
 * Returns a cleanup for `useEffect`.
 */
export function observeOnceInView(el: Element, onEnter: () => void, rootMargin = "0px 0px -10% 0px") {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        onEnter();
      }
    },
    { rootMargin },
  );
  observer.observe(el);
  return () => observer.disconnect();
}
