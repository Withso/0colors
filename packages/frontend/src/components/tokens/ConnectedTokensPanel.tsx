// ConnectedTokensPanel — thin pass-through now that TokensPanel reads from the store directly.
// Kept for backwards compatibility with call sites that use <ConnectedTokensPanel />.
import { TokensPanel } from './TokensPanel';
import type { CloudSyncStatus } from '../CloudSyncIndicator';

interface ConnectedTokensPanelProps {
  /** Only props that can't come from the store */
  onNavigateToNode: (nodeId: string) => void;
  onNavigateToProjects: () => void;
  cloudSyncStatus?: CloudSyncStatus;
  lastSyncedAt?: number;
  lastSyncError?: string;
  onManualSync?: () => void;
  dirtyCount?: number;
}

export function ConnectedTokensPanel({
  onNavigateToNode,
  onNavigateToProjects,
  cloudSyncStatus = 'local',
  lastSyncedAt,
  lastSyncError,
  onManualSync,
  dirtyCount = 0,
}: ConnectedTokensPanelProps) {
  return (
    <TokensPanel
      onNavigateToNode={onNavigateToNode}
      onNavigateToProjects={onNavigateToProjects}
      cloudSyncStatus={cloudSyncStatus}
      lastSyncedAt={lastSyncedAt}
      lastSyncError={lastSyncError}
      onManualSync={onManualSync}
      dirtyCount={dirtyCount}
    />
  );
}
