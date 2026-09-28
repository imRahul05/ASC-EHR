import * as React from "react"

const TICK_MS = 15_000

let now = Date.now()
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      listeners.forEach((listener) => listener())
    }, TICK_MS)
  }
  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

const getSnapshot = () => now

/**
 * Current time (ms) that re-renders subscribers every 15 s — one shared clock for live timers
 * (whiteboard elapsed-in-phase, procedure timers). External state → useSyncExternalStore.
 */
export function useNow(): number {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
