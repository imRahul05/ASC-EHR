"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ThemeProvider, TooltipProvider } from "@asc/ui";
import { MockProvider } from "../mocks/mock-provider";

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
  // Lazy init so each browser session gets one client (not recreated on re-render).
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: QUERY_DEFAULTS }));

  return (
    <ThemeProvider>
      <MockProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryClientProvider>
      </MockProvider>
    </ThemeProvider>
  );
}
