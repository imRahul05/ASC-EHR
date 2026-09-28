"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSearch } from "@asc/api-client/react";
import { formatDateTime } from "@asc/clinical-rules/time";
import { Button, CommandPalette, Kbd, type CommandGroup } from "@asc/ui";
import { CircleHelp, Map as MapIcon, Search, Sparkles, Stethoscope, UserRound } from "@asc/ui/icons";
import { openHelp, showWelcome, startTour } from "../../features/guide/guide-store";
import { useAuth } from "../../hooks/use-auth";
import { NAV_BY_ROLE } from "./nav-config";

interface PaletteState {
  readonly open: boolean;
  readonly query: string;
}

const CLOSED: PaletteState = { open: false, query: "" };

/** ⌘K / Ctrl+K: jump to a page, patient or case. */
export function CommandMenu() {
  const [palette, setPalette] = useState<PaletteState>(CLOSED);
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.role ?? "SURGEON";
  const canSearchRecords = role !== "PATIENT";
  const search = useSearch(canSearchRecords && palette.open ? palette.query : "");

  // Global shortcut: subscribing to a browser event is a legitimate effect.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPalette((current) => (current.open ? CLOSED : { open: true, query: "" }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const needle = palette.query.trim().toLowerCase();
  const helpItems = [
    { id: "help-page", label: "Help for this page", icon: CircleHelp, onSelect: openHelp },
    { id: "help-tour", label: "Start guided tour", icon: MapIcon, onSelect: () => startTour() },
    { id: "help-welcome", label: "Show welcome", icon: Sparkles, onSelect: showWelcome },
  ];
  const groups: CommandGroup[] = [
    {
      id: "pages",
      label: "Pages",
      items: NAV_BY_ROLE[role]
        .filter((item) => item.title.toLowerCase().includes(needle))
        .map((item) => ({ id: `page-${item.key}`, label: item.title, icon: item.icon, onSelect: () => router.push(item.href) })),
    },
    { id: "help", label: "Help", items: helpItems.filter((item) => item.label.toLowerCase().includes(needle)) },
    {
      id: "patients",
      label: "Patients",
      items: (search.data?.patients ?? []).map((patient) => ({
        id: `patient-${patient.id}`,
        label: patient.displayName,
        hint: patient.mrn,
        icon: UserRound,
        onSelect: () => router.push(`/patients/${patient.id}`),
      })),
    },
    {
      id: "cases",
      label: "Cases",
      items: (search.data?.cases ?? []).map((item) => ({
        id: `case-${item.id}`,
        label: `${item.caseNumber} · ${item.procedureLabel}`,
        hint: formatDateTime(item.scheduledStart),
        icon: Stethoscope,
        onSelect: () => router.push(`/cases/${item.id}`),
      })),
    },
  ];

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setPalette({ open: true, query: "" })}
        className="h-8 w-8 justify-center gap-2 px-0 text-muted-foreground sm:w-56 sm:justify-between sm:px-2.5"
        data-testid="command-menu-trigger"
        aria-label="Search (Command K)"
      >
        <span className="flex items-center gap-2">
          <Search className="size-3.5" />
          <span className="hidden text-xs font-normal sm:inline">Search…</span>
        </span>
        <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
      </Button>
      <CommandPalette
        open={palette.open}
        onOpenChange={(open) => setPalette(open ? { ...palette, open } : CLOSED)}
        query={palette.query}
        onQueryChange={(query) => setPalette({ open: true, query })}
        groups={groups}
        isLoading={search.isFetching}
        placeholder={canSearchRecords ? "Search patients, cases, pages…" : "Go to…"}
      />
    </>
  );
}
