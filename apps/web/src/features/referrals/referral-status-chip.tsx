import type { Referral, ReferralStatus } from "@asc/types";
import { cn } from "@asc/ui";
import { CircleCheck, CircleDot, Eye, Siren, XCircle, type LucideIcon } from "@asc/ui/icons";

interface ReferralStatusChipProps {
  readonly status: ReferralStatus;
  readonly priority: Referral["priority"];
}

const STATUS: Readonly<Record<ReferralStatus, { readonly label: string; readonly icon: LucideIcon; readonly className: string }>> = {
  new: { label: "New", icon: CircleDot, className: "border-primary/30 bg-accent text-accent-foreground" },
  in_review: { label: "In review", icon: Eye, className: "border-border text-muted-foreground" },
  converted: { label: "Converted", icon: CircleCheck, className: "border-success/30 bg-success/10 text-success" },
  rejected: { label: "Rejected", icon: XCircle, className: "border-border text-muted-foreground" },
};

const CHIP = "inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap";

/** Referral status (+ urgent flag) — icon + text, never colour alone. */
export function ReferralStatusChip({ status, priority }: ReferralStatusChipProps) {
  const { label, icon: Icon, className } = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      {priority === "urgent" && (
        <span className={cn(CHIP, "border-destructive/30 bg-destructive/8 text-destructive")} data-testid="referral-urgent">
          <Siren aria-hidden className="size-3" /> Urgent
        </span>
      )}
      <span className={cn(CHIP, className)} data-testid="referral-status">
        <Icon aria-hidden className="size-3" /> {label}
      </span>
    </span>
  );
}
