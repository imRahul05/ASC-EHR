"use client";

/**
 * AIMS Offline Queue Badge & Replay Trigger.
 *
 * Regulations & Standards:
 * - NFR-14: Zero data loss during offline intra-op charting with visual queue feedback.
 */

import { useOfflineAimsSync } from "@asc/api-client/react";
import { Button, OfflineQueueBadge as UiOfflineQueueBadge, useOnlineStatus } from "@asc/ui";
import { RefreshCw } from "@asc/ui/icons";

interface AimsOfflineQueueBadgeProps {
  readonly caseId: string;
}

export function AimsOfflineQueueBadge({ caseId }: AimsOfflineQueueBadgeProps) {
  const online = useOnlineStatus();
  const { pendingCount, isSyncing, flushQueue } = useOfflineAimsSync(caseId);

  return (
    <div className="flex items-center gap-2" data-testid="aims-offline-sync-container">
      <UiOfflineQueueBadge online={online} queued={pendingCount} />
      {online && pendingCount > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={isSyncing}
          onClick={() => void flushQueue()}
          data-testid="aims-offline-sync-button"
        >
          <RefreshCw className={isSyncing ? "animate-spin" : undefined} />
          Sync
        </Button>
      )}
    </div>
  );
}
