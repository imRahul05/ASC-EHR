"use client";

import { ErrorState } from "@asc/ui";

interface SegmentErrorProps {
  readonly error: Error & { readonly digest?: string };
  /** Next 16 error boundaries receive `retry` (re-fetch + re-render the segment). */
  readonly retry: () => void;
}

/** Route-segment error boundary body. Never shows raw error text (may contain PHI) — only a digest. */
export function SegmentError({ error, retry }: SegmentErrorProps) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <ErrorState
        title="This page ran into a problem"
        message={error.digest ? `Reference ${error.digest}. Try again, or reset the demo data from the user menu.` : "Try again, or reset the demo data from the user menu."}
        onRetry={retry}
      />
    </div>
  );
}
