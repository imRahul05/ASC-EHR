"use client"

import * as React from "react"
import { cn } from "../../lib/utils"

const TICK_MS = 1_000

/** One shared 1 s clock for every ElapsedTime on the page (external state → useSyncExternalStore). */
function subscribe(onTick: () => void): () => void {
  const id = window.setInterval(onTick, TICK_MS)
  return () => window.clearInterval(id)
}

const getSnapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS
const getServerSnapshot = () => 0

function toMs(value: number | string): number {
  return typeof value === "number" ? value : Date.parse(value)
}

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

/** `m:ss` below one hour, `h:mm:ss` above. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`
}

export interface ElapsedTimeProps {
  /** Start instant (epoch ms or ISO). */
  readonly since: number | string
  /** Freeze at this instant (epoch ms or ISO); omit to keep ticking. */
  readonly until?: number | string
  /** Accessible label prefix, e.g. "Procedure time". */
  readonly label?: string
  readonly className?: string
  readonly "data-testid"?: string
}

/** Live `m:ss` timer (tabular numbers). Not announced on every tick — pair with a static label for screen readers. */
export function ElapsedTime({ since, until, label, className, "data-testid": testId }: ElapsedTimeProps) {
  const now = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const end = until === undefined ? now : toMs(until)
  const seconds = now === 0 && until === undefined ? 0 : (end - toMs(since)) / 1000
  const text = formatClock(seconds)
  return (
    <time
      data-testid={testId ?? "elapsed-time"}
      aria-label={label ? `${label} ${text}` : undefined}
      className={cn("font-mono tabular-nums", className)}
    >
      {text}
    </time>
  )
}
