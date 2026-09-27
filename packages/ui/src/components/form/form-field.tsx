import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../../lib/utils"
import { Label } from "../ui/label"

/**
 * Declarative description of one input. Forms keep a readonly array/map of these
 * and render them with `.map()` — one config entry per field, not one JSX block.
 */
export interface FieldConfig<TName extends string = string> {
  readonly name: TName
  readonly label: string
  readonly type?: "text" | "email" | "password" | "date" | "tel"
  readonly placeholder?: string
  readonly autoComplete?: string
  readonly icon?: LucideIcon
  /** Monospace for identifiers (NPI, licence, facility codes). */
  readonly mono?: boolean
  readonly maxLength?: number
}

export interface FormFieldProps {
  /** id of the control inside; used for the label and the error message id. */
  readonly id: string
  readonly label: ReactNode
  readonly error?: string
  /** Optional leading icon drawn inside the control (control needs left padding, e.g. `pl-9`). */
  readonly icon?: LucideIcon
  /** Optional element on the label row (e.g. a "Forgot password?" link). */
  readonly labelAction?: ReactNode
  readonly className?: string
  readonly children: ReactNode
}

/**
 * Label + control + error for one form field. Forms render a list of field
 * configs with `.map()` into this component instead of hand-writing each block.
 */
export function FormField({ id, label, error, icon: Icon, labelAction, className, children }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)} data-testid={`field-${id}`}>
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs font-medium">
          {label}
        </Label>
        {labelAction}
      </div>
      <div className="relative">
        {Icon && <Icon aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />}
        {children}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
