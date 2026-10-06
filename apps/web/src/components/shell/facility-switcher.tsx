"use client";

import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@asc/ui";
import { Building2, Check, ChevronDown } from "@asc/ui/icons";
import { useAuth } from "../../hooks/use-auth";

/**
 * Facility switcher. Shown only when the user holds grants at more than one facility;
 * switching changes what the user may do (nav, workspaces, guarded screens).
 */
export function FacilitySwitcher() {
  const { facilities, facilityId, selectFacility } = useAuth();
  if (facilities.length < 2) return null;
  const current = facilities.find((facility) => facility.id === facilityId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs font-medium" data-testid="facility-switcher">
            <Building2 aria-hidden className="size-3.5 text-muted-foreground" />
            <span className="hidden max-w-40 truncate md:inline">{current?.name ?? "Choose facility"}</span>
            <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Switch facility</DropdownMenuLabel>
          {facilities.map((facility) => (
            <DropdownMenuItem key={facility.id} onClick={() => selectFacility(facility.id)} data-testid={`facility-option-${facility.id}`}>
              <Check aria-hidden className={facility.id === facilityId ? "size-3.5 text-primary" : "size-3.5 opacity-0"} />
              <span className="text-xs font-medium">{facility.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
