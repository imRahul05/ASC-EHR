"use client";

import { getPublicMedplumBaseUrl, getPublicMedplumClientId } from "@asc/config/public-env";
import { MedplumProvider } from "@medplum/react-hooks";
import { QueryClient, QueryClientProvider, type DefaultOptions } from "@tanstack/react-query";
import { createElement, useState, type ReactNode } from "react";

import { createBrowserMedplumClient } from "../medplum/browser";

/**
 * apps/web's data providers (P04 T2): one TanStack Query client and, when Medplum is configured
 * (`NEXT_PUBLIC_MEDPLUM_BASE_URL`), the signed-in user's Medplum client for `@medplum/react-hooks`. Tokens stay
 * in memory (LM-004). Unconfigured (the hosted demo on in-browser mocks), no Medplum client exists at all, so
 * nothing can fall back to a hosted Medplum. Features use the hooks; they never create a client.
 */
export function AscMedplumProvider({ children, queryDefaults }: { readonly children: ReactNode; readonly queryDefaults?: DefaultOptions }) {
  // Lazy init so each browser session gets one client of each (not recreated on re-render).
  const [queryClient] = useState(() => new QueryClient(queryDefaults === undefined ? {} : { defaultOptions: queryDefaults }));
  const [medplum] = useState(() => createBrowserMedplumClient({ baseUrl: getPublicMedplumBaseUrl(), clientId: getPublicMedplumClientId() }));
  const withQuery = createElement(QueryClientProvider, { client: queryClient, children });
  return medplum === undefined ? withQuery : createElement(MedplumProvider, { medplum, children: withQuery });
}
