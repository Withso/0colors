import { useState, useEffect, useRef, useCallback } from 'react';
import { Cloud, CloudOff, Check, AlertTriangle, WifiOff, Loader2 } from 'lucide-react';
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import './CloudSyncIndicator.css';

export type CloudSyncStatus = 'local' | 'idle' | 'dirty' | 'syncing' | 'synced' | 'error' | 'offline';

interface CloudSyncIndicatorProps {
  status: CloudSyncStatus;
  lastSyncedAt?: number;
  lastError?: string;
  onManualSync?: () => void;
  dirtyCount?: number;
}

function formatSyncTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function CloudSyncIndicator({
  status,
  lastSyncedAt,
  lastError,
  onManualSync,
  dirtyCount = 0,
}: CloudSyncIndicatorProps) {
  const [showSynced, setShowSynced] = useState(false);
  const prevStatusRef = useRef(status);
  const [timeStr, setTimeStr] = useState(() => lastSyncedAt ? formatSyncTime(lastSyncedAt) : '');

  // When status transitions to 'synced', show checkmark for 3s then go idle
  useEffect(() => {
    if (status === 'synced' && prevStatusRef.current === 'syncing') {
      setShowSynced(true);
      const t = setTimeout(() => setShowSynced(false), 3000);
      return () => clearTimeout(t);
    }
    if (status !== 'synced') {
      setShowSynced(false);
    }
    prevStatusRef.current = status;
  }, [status]);

  // Refresh relative time every 30s
  useEffect(() => {
    if (!lastSyncedAt) return;
    setTimeStr(formatSyncTime(lastSyncedAt));
    const interval = setInterval(() => setTimeStr(formatSyncTime(lastSyncedAt)), 30000);
    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  const handleClick = useCallback(() => {
    if (status === 'local') return;
    onManualSync?.();
  }, [status, onManualSync]);

  // Not a cloud project — show cloud-off
  if (status === 'local') {
    return (
      <TooltipPrimitive.Provider delayDuration={300}>
        <TooltipPrimitive.Root>
          <TooltipPrimitive.Trigger asChild>
            <div className="sync-local">
              <CloudOff size={16} />
            </div>
          </TooltipPrimitive.Trigger>
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              side="bottom"
              sideOffset={6}
              className="sync-tooltip-local"
            >
              <div className="sync-tooltip-local-body">
                <span className="sync-local-title">Local project</span>
                <span className="sync-local-subtitle">Not synced to cloud</span>
              </div>
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
      </TooltipPrimitive.Provider>
    );
  }

  // Derive visual state
  const effectiveStatus = showSynced ? 'synced' : status;
  const isClickable = status !== 'syncing';

  const getTooltipContent = () => {
    const lines: { label: string; value: string; color?: string }[] = [];

    switch (effectiveStatus) {
      case 'syncing':
        lines.push({ label: 'Status', value: 'Syncing...', color: 'var(--indigo-500)' });
        break;
      case 'synced':
        lines.push({ label: 'Status', value: 'All changes saved', color: 'var(--green-500)' });
        break;
      case 'error':
        lines.push({ label: 'Status', value: 'Sync failed', color: 'var(--red-500)' });
        if (lastError) {
          lines.push({ label: 'Error', value: lastError.length > 50 ? lastError.slice(0, 50) + '...' : lastError, color: 'var(--red-500)' });
        }
        break;
      case 'dirty':
        lines.push({ label: 'Status', value: `Unsaved changes${dirtyCount > 1 ? ` (${dirtyCount} projects)` : ''}`, color: 'var(--yellow-400)' });
        break;
      case 'offline':
        lines.push({ label: 'Status', value: 'Offline — will sync when online', color: 'var(--yellow-400)' });
        break;
      default: // idle
        lines.push({ label: 'Status', value: 'Up to date', color: 'var(--green-500)' });
        break;
    }

    if (lastSyncedAt) {
      lines.push({ label: 'Last saved', value: timeStr });
    } else {
      lines.push({ label: 'Last saved', value: 'Never' });
    }

    if (isClickable && effectiveStatus !== 'synced') {
      lines.push({ label: '', value: 'Click to sync now', color: '#888' });
    }

    return lines;
  };

  const renderIcon = () => {
    switch (effectiveStatus) {
      case 'syncing':
        return (
          <div className="sync-icon-wrap">
            <Cloud size={16} style={{ color: 'var(--grey-100)' }} />
            <div className="sync-icon-badge">
              <Loader2 size={10} style={{ color: 'var(--indigo-400)', animation: 'spin 1s linear infinite' }} />
            </div>
          </div>
        );
      case 'synced':
        return (
          <div className="sync-icon-wrap">
            <Cloud size={16} style={{ color: 'var(--grey-100)' }} />
            <div className="sync-icon-badge sync-icon-badge-bg">
              <Check size={10} style={{ color: 'var(--green-500)' }} />
            </div>
          </div>
        );
      case 'error':
        return (
          <div className="sync-icon-wrap">
            <Cloud size={16} style={{ color: 'var(--grey-100)' }} />
            <div className="sync-icon-badge sync-icon-badge-bg">
              <AlertTriangle size={10} style={{ color: 'var(--red-500)' }} />
            </div>
          </div>
        );
      case 'dirty':
        return (
          <div className="sync-icon-wrap">
            <Cloud size={16} style={{ color: 'var(--grey-100)' }} />
            <div className="sync-icon-badge--top sync-dirty-dot" />
          </div>
        );
      case 'offline':
        return (
          <div className="sync-icon-wrap">
            <Cloud size={16} style={{ color: 'var(--grey-500)' }} />
            <div className="sync-icon-badge sync-icon-badge-bg">
              <WifiOff size={10} style={{ color: 'var(--yellow-500)' }} />
            </div>
          </div>
        );
      default: // idle
        return <Cloud size={16} style={{ color: 'var(--grey-100)' }} />;
    }
  };

  const tooltipLines = getTooltipContent();

  const buttonClasses = [
    'sync-button',
    isClickable ? 'sync-button--clickable' : 'sync-button--waiting',
    effectiveStatus === 'syncing' ? 'sync-button--pulsing' : '',
  ].filter(Boolean).join(' ');

  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            onClick={handleClick}
            disabled={status === 'syncing'}
            className={buttonClasses}
            aria-label="Cloud sync status"
          >
            {renderIcon()}
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="bottom"
            sideOffset={6}
            className="sync-tooltip"
          >
            <div className="sync-tooltip-body">
              {tooltipLines.map((line, i) => (
                line.label ? (
                  <div key={i} className="sync-tooltip-row">
                    <span className="sync-tooltip-label">{line.label}</span>
                    <span className="sync-tooltip-value" style={{ color: line.color || 'var(--grey-100)' }}>
                      {line.value}
                    </span>
                  </div>
                ) : (
                  <div key={i} className="sync-tooltip-divider">
                    <span className="sync-tooltip-hint" style={{ color: line.color || 'var(--grey-500)' }}>
                      {line.value}
                    </span>
                  </div>
                )
              ))}
            </div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
