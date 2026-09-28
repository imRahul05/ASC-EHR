import type { EligibilityStatus } from "@asc/types"
import { BadgeCheck, CircleAlert, CircleDashed, CircleX, type LucideIcon } from "lucide-react"
import { cn } from "../../lib/utils"

export interface EligibilityChipProps {
  /** `undefined` / `null` = never checked. */
  readonly status: EligibilityStatus | null | undefined
  readonly className?: string
}

type ChipKey = EligibilityStatus | "unchecked"

const CHIP: Readonly<Record<ChipKey, { readonly label: string; readonly icon: LucideIcon; readonly className: string }>> = {
  active: { label: "Eligible", icon: BadgeCheck, className: "border-success/30 bg-success/10 text-success" },
  inactive: { label: "Inactive", icon: CircleX, className: "border-destructive/30 bg-destructive/8 text-destructive" },
  pending: { label: "Pending", icon: CircleDashed, className: "border-border text-muted-foreground" },
  error: { label: "Check failed", icon: CircleAlert, className: "border-warning/30 bg-warning/10 text-warning" },
  unchecked: { label: "Not verified", icon: CircleDashed, className: "border-border text-muted-foreground" },
}

/** Insurance eligibility (X12 270/271) status as a chip — colour + icon + text. */
export function EligibilityChip({ status, className }: EligibilityChipProps) {
  const chip = CHIP[status ?? "unchecked"]
  const Icon = chip.icon
  return (
    <span
      data-testid="eligibility-chip"
      data-status={status ?? "unchecked"}
      className={cn("inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap", chip.className, className)}
    >
      <Icon aria-hidden className="size-3" />
      {chip.label}
    </span>
  )
}
