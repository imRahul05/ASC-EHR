"use client";

import Link from "next/link";
import { useQualityMetrics } from "@asc/api-client/react";
import type { UserProfile } from "@asc/types";
import { Button, ErrorState, LoadingSkeleton, SectionCard, TargetBarList } from "@asc/ui";
import { ADR_TARGETS, formatPercent } from "../quality/quality-metrics-config";

interface AdrPanelProps {
  readonly user: UserProfile;
}

/** Surgeon's 30-day adenoma detection rate vs peers and the 25 % / 30 % targets. */
export function AdrPanel({ user }: AdrPanelProps) {
  const quality = useQualityMetrics();
  const rows = (quality.data?.byProvider ?? []).map((item) => ({
    id: item.provider.id,
    label: item.provider.id === user.id ? `${item.provider.name} (you)` : item.provider.name,
    value: item.adr,
    hint: `${item.cases} colonoscopies`,
  }));

  return (
    <SectionCard
      title="Adenoma detection rate · 30 days"
      actions={
        <Button variant="ghost" size="sm" render={<Link href="/quality" />} nativeButton={false}>
          Quality
        </Button>
      }
      data-testid="dashboard-adr"
    >
      {quality.isPending && <LoadingSkeleton variant="table" rows={3} />}
      {quality.isError && <ErrorState message="Could not load quality metrics." onRetry={() => void quality.refetch()} />}
      {quality.isSuccess && <TargetBarList rows={rows} max={0.5} formatValue={formatPercent} targets={ADR_TARGETS} />}
    </SectionCard>
  );
}
