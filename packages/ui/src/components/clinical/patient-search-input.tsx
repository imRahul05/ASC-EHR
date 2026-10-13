"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { PatientListItem } from "@asc/types";
import { Search, Loader2 } from "../../icons";
import { cn } from "../../lib/utils";

export interface PatientSearchInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly results: readonly PatientListItem[];
  readonly isLoading?: boolean;
  readonly onSelect: (patient: PatientListItem) => void;
  readonly placeholder?: string;
  readonly className?: string;
  readonly autoFocus?: boolean;
  readonly "data-testid"?: string;
}

const STEP: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

/**
 * Presentational patient search typeahead with accessible keyboard navigation (ArrowUp, ArrowDown, Enter, Escape).
 * Shows matching patients with Name, DOB, Age/Gender, MRN, and Phone.
 */
export function PatientSearchInput({
  value,
  onChange,
  results,
  isLoading = false,
  onSelect,
  placeholder = "Search patients by name, MRN, or DOB…",
  className,
  autoFocus = false,
  "data-testid": testId = "patient-search-input",
}: PatientSearchInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const safeActiveIndex =
    results.length === 0 ? -1 : Math.max(-1, Math.min(activeIndex, results.length - 1));

  const handleSelect = (patient: PatientListItem) => {
    onSelect(patient);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    const step = STEP[event.key];
    if (step !== undefined && results.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      const nextIndex =
        safeActiveIndex === -1
          ? step === 1
            ? 0
            : results.length - 1
          : (safeActiveIndex + step + results.length) % results.length;
      setActiveIndex(nextIndex);
      return;
    }

    if (event.key === "Enter") {
      if (isOpen && safeActiveIndex >= 0 && safeActiveIndex < results.length) {
        const item = results[safeActiveIndex];
        if (item) {
          event.preventDefault();
          handleSelect(item);
        }
      }
    }
  };

  const showDropdown = isOpen && (results.length > 0 || isLoading);

  return (
    <div className={cn("relative w-full", className)} data-testid={testId}>
      <div className="relative flex items-center">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
        />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label={placeholder}
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            safeActiveIndex >= 0 ? `${baseId}-option-${safeActiveIndex}` : undefined
          }
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (value.trim().length > 0) setIsOpen(true);
          }}
          onBlur={() => {
            // Short delay to allow click on dropdown option
            if (blurTimeoutRef.current !== null) {
              clearTimeout(blurTimeoutRef.current);
            }
            blurTimeoutRef.current = setTimeout(() => setIsOpen(false), 200);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-8 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid={`${testId}-field`}
        />
        {isLoading && (
          <Loader2
            aria-hidden
            className="pointer-events-none absolute right-3 size-4 animate-spin text-muted-foreground"
          />
        )}
      </div>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Matching patients"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
          data-testid={`${testId}-dropdown`}
        >
          {isLoading && results.length === 0 && (
            <div className="p-3 text-center text-xs text-muted-foreground">
              Searching patients…
            </div>
          )}

          {results.map((patient, index) => {
            const isSelected = index === safeActiveIndex;
            const optionId = `${baseId}-option-${index}`;
            return (
              <div
                key={patient.id}
                id={optionId}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(patient);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-sm px-3 py-2 text-sm transition-colors",
                  isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                )}
                data-testid={`${testId}-option-${patient.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{patient.displayName}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {patient.age}y · {patient.sex}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{patient.mrn}</span>
                    <span>·</span>
                    <span className="tabular-nums">DOB: {patient.dateOfBirth}</span>
                    {patient.phone ? (
                      <>
                        <span>·</span>
                        <span className="tabular-nums">{patient.phone}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
