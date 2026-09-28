"use client";

import { Button, DataTable, SectionCard } from "@asc/ui";
import { ROLE_LABEL } from "@/components/shell/nav-config";
import { useDemoPresets } from "@/hooks/use-auth";
import { PERSONA_GUIDE } from "./guide-content";
import { useGoTo } from "./use-go-to";

/** Demo personas: who they are, where they land, what to try — with a one-click switch. */
export function GuidePersonas() {
  const presets = useDemoPresets();
  const { goTo, pendingKey, role } = useGoTo();
  const rows = presets.data ?? [];

  return (
    <SectionCard title="Demo personas" description="Each one is a real login with its own screens. Switching keeps the data." contentClassName="p-0" data-testid="guide-personas">
      <DataTable
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={presets.isPending}
        columns={[
          {
            id: "role",
            header: "Persona",
            cell: (row) => (
              <span className="flex flex-col">
                <span className="font-medium">{ROLE_LABEL[row.role].label}</span>
                <span className="text-xs text-muted-foreground">{row.fullName}</span>
              </span>
            ),
          },
          { id: "lands", header: "Lands on", cell: (row) => PERSONA_GUIDE[row.role].lands, className: "hidden md:table-cell" },
          { id: "try", header: "Try", cell: (row) => <span className="text-muted-foreground">{PERSONA_GUIDE[row.role].tryThis}</span>, className: "hidden sm:table-cell" },
          {
            id: "switch",
            header: <span className="sr-only">Switch</span>,
            align: "right",
            cell: (row) =>
              row.role === role ? (
                <span className="text-xs text-muted-foreground">Current</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingKey !== null}
                  onClick={() => void goTo(row.role, row.role === "PATIENT" ? "/my-care" : "/dashboard", row.role)}
                  data-testid={`guide-switch-${row.role.toLowerCase()}`}
                >
                  Switch
                </Button>
              ),
          },
        ]}
      />
    </SectionCard>
  );
}
