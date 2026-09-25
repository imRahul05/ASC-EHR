import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton, cn } from "@asc/ui";

const TONE_CLASS: Record<"default" | "amber" | "emerald", string> = {
  default: "",
  amber: "text-amber-600 dark:text-amber-500",
  emerald: "text-emerald-600 dark:text-emerald-500",
};

interface KpiCardProps {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly tone?: keyof typeof TONE_CLASS;
  readonly isLoading?: boolean;
}

export function KpiCard({ label, value, hint, tone = "default", isLoading = false }: KpiCardProps) {
  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader className="p-4 pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
        {isLoading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <CardTitle className={cn("text-2xl font-bold tracking-tight", TONE_CLASS[tone])}>
            {value}
          </CardTitle>
        )}
      </CardHeader>
      <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}
