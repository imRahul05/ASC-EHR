"use client"

import { CornerDownLeft, LoaderCircle, Search, type LucideIcon } from "lucide-react"
import { useId, useState, type KeyboardEvent } from "react"
import { cn } from "../../lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog"
import { Kbd } from "../ui/kbd"

export interface CommandItem {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly icon?: LucideIcon
  readonly onSelect: () => void
}

export interface CommandGroup {
  readonly id: string
  readonly label: string
  readonly items: readonly CommandItem[]
}

export interface CommandPaletteProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly query: string
  readonly onQueryChange: (query: string) => void
  /** Already filtered groups (the caller decides what matches). */
  readonly groups: readonly CommandGroup[]
  readonly isLoading?: boolean
  readonly placeholder?: string
  readonly emptyLabel?: string
}

const STEP: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 }

/** ⌘K palette on the Base UI Dialog (no cmdk): combobox input + listbox, arrow keys + Enter. */
export function CommandPalette({
  open,
  onOpenChange,
  query,
  onQueryChange,
  groups,
  isLoading = false,
  placeholder = "Search patients, cases, pages…",
  emptyLabel = "No results",
}: CommandPaletteProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const baseId = useId()
  const flat = groups.flatMap((group) => group.items)
  const active = flat.length === 0 ? -1 : Math.min(activeIndex, flat.length - 1)
  const optionId = (index: number) => `${baseId}-option-${index}`

  const select = (item: CommandItem | undefined) => {
    if (!item) return
    onOpenChange(false)
    item.onSelect()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const step = STEP[event.key]
    if (step !== undefined && flat.length > 0) {
      event.preventDefault()
      setActiveIndex((active + step + flat.length) % flat.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      select(flat[active])
    }
  }

  const visibleGroups = groups.filter((group) => group.items.length > 0)
  const offsets = visibleGroups.map((_, groupIndex) =>
    visibleGroups.slice(0, groupIndex).reduce((sum, group) => sum + group.items.length, 0)
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[15vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" data-testid="command-palette">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Search and jump to patients, cases and pages.</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-3">
          {isLoading ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <Search aria-hidden className="size-4 text-muted-foreground" />
          )}
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls={`${baseId}-list`}
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            aria-autocomplete="list"
            value={query}
            onChange={(event) => {
              setActiveIndex(0)
              onQueryChange(event.target.value)
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            data-testid="command-palette-input"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div id={`${baseId}-list`} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-1.5">
          {flat.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>}
          {visibleGroups.map((group, groupIndex) => (
              <div key={group.id} role="group" aria-label={group.label} className="py-1">
                <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">{group.label}</p>
                {group.items.map((item, itemIndex) => {
                  const index = (offsets[groupIndex] ?? 0) + itemIndex
                  const Icon = item.icon
                  const isActive = index === active
                  return (
                    <div
                      key={item.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={isActive}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => select(item)}
                      data-testid={`command-item-${item.id}`}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm",
                        isActive ? "bg-accent text-accent-foreground" : "text-foreground"
                      )}
                    >
                      {Icon && <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.hint && <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>}
                      {isActive && <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
                    </div>
                  )
                })}
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
