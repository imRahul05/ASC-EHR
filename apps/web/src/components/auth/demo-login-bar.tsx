"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asc/ui";
import { DEMO_PRESETS } from "../../lib/mock/data/users.mock";
import { useAuth } from "../../hooks/use-auth";

export function DemoLoginBar() {
  const { loginWithDemo, isDemoLoggingIn } = useAuth();
  const [selectedId, setSelectedId] = useState(DEMO_PRESETS[0]?.id ?? "");

  const selectedPreset = DEMO_PRESETS.find((preset) => preset.id === selectedId);

  const selectItems = DEMO_PRESETS.map((preset) => ({
    value: preset.id,
    label: `${preset.fullName} — ${preset.badgeLabel}`,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Instant Demo Access
          </h3>
          <p className="text-xs text-muted-foreground">
            Pick a role to sign in with a demo account:
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
          Mock Auth Active
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Select
          items={selectItems}
          value={selectedId}
          onValueChange={(value) => setSelectedId(value ?? "")}
        >
          <SelectTrigger className="flex-1 w-full h-9 text-xs">
            <SelectValue placeholder="Select a demo role" />
          </SelectTrigger>
          <SelectContent>
            {DEMO_PRESETS.map((preset) => (
              <SelectItem key={preset.id} value={preset.id} className="text-xs">
                {preset.fullName} — {preset.badgeLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={() => void loginWithDemo(selectedId)}
          disabled={isDemoLoggingIn || !selectedId}
          className="h-9 text-xs gap-1.5 shrink-0"
        >
          {isDemoLoggingIn ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" />
          )}
          Sign In
        </Button>
      </div>

      {selectedPreset && (
        <p className="text-[11px] text-muted-foreground">{selectedPreset.description}</p>
      )}
    </div>
  );
}
