"use client";

import { Button, DataTable, SectionCard } from "@asc/ui";
import { useDemoPresets } from "@/hooks/use-auth";
import { PERSONAS } from "@/lib/personas";
import { useGoTo } from "./use-go-to";

/** Demo personas: who they are, where they land, what to try — with a one-click switch. */
export function GuidePersonas() {
  const presets = useDemoPresets();
  const { goTo, pendingKey, persona } = useGoTo();
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
                <span className="font-medium">{PERSONAS[row.id].label}</span>
                <span className="text-xs text-muted-foreground">{row.fullName}</span>
              </span>
            ),
          },
          { id: "lands", header: "Lands on", cell: (row) => PERSONAS[row.id].lands, className: "hidden md:table-cell" },
          { id: "try", header: "Try", cell: (row) => <span className="text-muted-foreground">{PERSONAS[row.id].tryThis}</span>, className: "hidden sm:table-cell" },
          {
            id: "switch",
            header: <span className="sr-only">Switch</span>,
            align: "right",
            cell: (row) =>
              row.id === persona ? (
                <span className="text-xs text-muted-foreground">Current</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingKey !== null}
                  onClick={() => void goTo(row.id, PERSONAS[row.id].home, row.id)}
                  data-testid={`guide-switch-${row.id.replace("demo-", "")}`}
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
