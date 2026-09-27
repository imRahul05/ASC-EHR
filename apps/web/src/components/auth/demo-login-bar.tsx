"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "@asc/ui/icons";
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@asc/ui";
import { useAuth, useDemoPresets } from "../../hooks/use-auth";

export function DemoLoginBar() {
  const { loginWithDemo, isDemoLoggingIn } = useAuth();
  const { data: presets = [] } = useDemoPresets();
  // Explicit user choice only; the effective selection falls back to the first preset (derived, no effect).
  const [chosenId, setChosenId] = useState<string | null>(null);
  const selected = presets.find((preset) => preset.id === chosenId) ?? presets[0];

  const selectItems = presets.map((preset) => ({
    value: preset.id,
    label: `${preset.fullName} — ${preset.badgeLabel}`,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Instant Demo Access</h3>
          <p className="text-xs text-muted-foreground">Pick a role to sign in with a demo account:</p>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
          Mock Auth Active
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Select items={selectItems} value={selected?.id ?? ""} onValueChange={(value) => setChosenId(value)}>
          <SelectTrigger className="flex-1 w-full h-9 text-xs" data-testid="demo-preset-select">
            <SelectValue placeholder="Select a demo role" />
          </SelectTrigger>
          <SelectContent>
            {selectItems.map((item) => (
              <SelectItem key={item.value} value={item.value} className="text-xs">
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={() => selected && void loginWithDemo(selected.id)}
          disabled={isDemoLoggingIn || !selected}
          className="h-9 text-xs gap-1.5 shrink-0"
          data-testid="demo-sign-in"
        >
          {isDemoLoggingIn ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
          Sign In
        </Button>
      </div>

      {selected && <p className="text-[11px] text-muted-foreground">{selected.description}</p>}
    </div>
  );
}
