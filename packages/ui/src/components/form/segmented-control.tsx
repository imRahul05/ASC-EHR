"use client"

import type { KeyboardEvent, ReactNode } from "react"
import { cn } from "../../lib/utils"

export interface SegmentedOption<TValue extends string | number> {
  readonly value: TValue
  readonly label: ReactNode
  /** Secondary line under the label (e.g. the criterion text of a score). */
  readonly hint?: ReactNode
}

export interface SegmentedControlProps<TValue extends string | number> {
  readonly options: readonly SegmentedOption<TValue>[]
  /** `null` = nothing chosen yet. */
  readonly value: TValue | null
  readonly onValueChange: (value: TValue) => void
  readonly "aria-label": string
  readonly disabled?: boolean
  readonly size?: "sm" | "md"
  readonly className?: string
  readonly "data-testid"?: string
}

const STEP: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/** Single choice from a few options as a row of segments (radio group: arrow keys move, colour + weight mark the choice). */
export function SegmentedControl<TValue extends string | number>({
  options,
  value,
  onValueChange,
  disabled = false,
  size = "md",
  className,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: SegmentedControlProps<TValue>) {
  const selectedIndex = options.findIndex((option) => option.value === value)
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = Object.hasOwn(STEP, event.key) ? STEP[event.key] : undefined
    if (step === undefined || disabled) return
    event.preventDefault()
    const next = options[(focusIndex + step + options.length) % options.length]
    if (!next) return
    onValueChange(next.value)
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")
    buttons[options.indexOf(next)]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-testid={testId}
      onKeyDown={onKeyDown}
      className={cn("inline-flex w-full gap-1 rounded-lg border border-border bg-muted/50 p-1", className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === focusIndex ? 0 : -1}
            disabled={disabled}
            data-state={checked ? "on" : "off"}
            data-testid={testId ? `${testId}-${String(option.value)}` : undefined}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center rounded-md px-2 text-center transition-colors outline-none",
              "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
              size === "sm" ? "min-h-8 py-1 text-xs" : "min-h-11 py-1.5 text-sm",
              checked
                ? "bg-card font-semibold text-foreground shadow-xs ring-1 ring-primary/40"
                : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
            )}
          >
            <span className="tabular-nums">{option.label}</span>
            {option.hint && <span className="line-clamp-2 text-[11px] leading-tight font-normal text-muted-foreground">{option.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}
