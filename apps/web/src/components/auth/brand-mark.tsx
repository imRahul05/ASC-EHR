import { cn } from "@asc/ui";
import { Activity } from "@asc/ui/icons";

interface BrandMarkProps {
  readonly className?: string;
}

/** Logo lockup used on the landing page and auth screens. */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-foreground text-background">
        <Activity className="size-4" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">
        ASC EHR <span className="font-normal text-muted-foreground">GI</span>
      </span>
    </span>
  );
}
