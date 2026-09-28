"use client"

import { cn } from "../../lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"

export interface SelectOption<TValue extends string = string> {
  readonly value: TValue
  readonly label: string
  /** Secondary text shown after the label inside the list. */
  readonly hint?: string
}

export interface OptionSelectProps<TValue extends string = string> {
  /** id of the trigger — pair with `FormField id` for the label. */
  readonly id: string
  readonly options: readonly SelectOption<TValue>[]
  readonly value: TValue | "" | null | undefined
  readonly onValueChange: (value: TValue) => void
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly className?: string
  readonly "data-testid"?: string
}

/** Config-driven select: pass `options` (value + label) instead of hand-writing items. Base UI under the hood. */
export function OptionSelect<TValue extends string = string>({
  id,
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  disabled,
  invalid,
  className,
  "data-testid": testId,
}: OptionSelectProps<TValue>) {
  const items = options.map((option) => ({ value: option.value, label: option.label }))
  return (
    <Select
      items={items}
      value={value || null}
      disabled={disabled}
      onValueChange={(next) => {
        if (next) onValueChange(next)
      }}
    >
      <SelectTrigger id={id} aria-invalid={invalid || undefined} className={cn("w-full", className)} data-testid={testId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span>{option.label}</span>
            {option.hint && <span className="text-xs text-muted-foreground">{option.hint}</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
