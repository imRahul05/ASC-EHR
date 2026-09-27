"use client";

import { isApiMockingEnabled } from "@asc/config/public-env";
import { use, type ReactNode } from "react";

/**
 * Resolves once the MSW worker is ready (or immediately when mocking is off / on the server).
 * Module-level so it starts once and every render awaits the same promise via `use()`.
 */
const mocksReady: Promise<void> =
  typeof window !== "undefined" && isApiMockingEnabled()
    ? import("./browser").then(async ({ worker }) => {
        await worker.start({ onUnhandledRequest: "bypass", quiet: true });
      })
    : Promise.resolve();

export function MockProvider({ children }: { readonly children: ReactNode }) {
  use(mocksReady);
  return children;
}
