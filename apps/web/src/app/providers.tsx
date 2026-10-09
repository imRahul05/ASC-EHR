"use client";

import { AscMedplumProvider } from "@asc/api-client/react";
import type { ReactNode } from "react";
import { ThemeProvider } from "@asc/ui/components/theme/theme-provider";
import { Toaster } from "@asc/ui/components/ui/sonner";
import { TooltipProvider } from "@asc/ui/components/ui/tooltip";

const QUERY_DEFAULTS = {
  queries: {
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  },
} as const;

interface ProvidersProps {
  readonly children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider>
      <AscMedplumProvider queryDefaults={QUERY_DEFAULTS}>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </AscMedplumProvider>
    </ThemeProvider>
  );
}
