"use client";

import { Stethoscope, ShieldAlert, HeartPulse, Building2, UserCircle, ArrowRight, Loader2 } from "lucide-react";
import { Badge, Button, Card, CardContent } from "@asc/ui";
import type { UserRole } from "@asc/types";
import { DEMO_PRESETS } from "../../lib/mock/data/users.mock";
import { useAuth } from "../../hooks/use-auth";

const ROLE_ICON_MAP: Record<UserRole, typeof Stethoscope> = {
  SURGEON: Stethoscope,
  ANESTHESIOLOGIST: ShieldAlert,
  NURSE: HeartPulse,
  ADMIN: Building2,
  PATIENT: UserCircle,
};

export function DemoLoginBar() {
  const { loginWithDemo, isDemoLoggingIn } = useAuth();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Instant Demo Access
          </h3>
          <p className="text-xs text-muted-foreground">
            One-click sign-in to test role-specific clinical workflows:
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
          Mock Auth Active
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DEMO_PRESETS.map((preset) => {
          const Icon = ROLE_ICON_MAP[preset.role];
          return (
            <Card
              key={preset.id}
              className="group relative border-border/70 hover:border-foreground/40 transition-all cursor-pointer bg-card/50 hover:bg-card shadow-xs"
              onClick={() => void loginWithDemo(preset.id)}
            >
              <CardContent className="p-3 flex items-start gap-2.5">
                <div className="p-1.5 rounded-md bg-muted text-foreground group-hover:bg-foreground group-hover:text-background transition-colors shrink-0 mt-0.5">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold truncate text-foreground">
                      {preset.fullName}
                    </span>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 shrink-0 font-normal">
                      {preset.badgeLabel}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                    {preset.description}
                  </p>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  disabled={isDemoLoggingIn}
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  aria-label={`Log in as ${preset.fullName}`}
                >
                  {isDemoLoggingIn ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3 w-3" />
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
