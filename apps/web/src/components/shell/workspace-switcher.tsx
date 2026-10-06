"use client";

import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@asc/ui";
import { Check, ChevronDown, LayoutDashboard } from "@asc/ui/icons";
import { useRouter } from "next/navigation";
import { useWorkspace } from "../../hooks/use-workspace";

/** Workspace switcher. Shown only when the user's capabilities open more than one workspace here. */
export function WorkspaceSwitcher() {
  const router = useRouter();
  const { workspaces, current, select } = useWorkspace();
  if (workspaces.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs font-medium" data-testid="workspace-switcher">
            <LayoutDashboard aria-hidden className="size-3.5 text-muted-foreground" />
            <span className="hidden md:inline">{current?.label}</span>
            <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Switch workspace</DropdownMenuLabel>
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.key}
              onClick={() => {
                select(workspace.key);
                router.push(workspace.home);
              }}
              data-testid={`workspace-option-${workspace.key}`}
            >
              <Check aria-hidden className={workspace.key === current?.key ? "size-3.5 text-primary" : "size-3.5 opacity-0"} />
              <span className="text-xs font-medium">{workspace.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
