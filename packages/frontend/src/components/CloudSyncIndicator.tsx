import { useState, useEffect, useRef, useCallback } from 'react';
import { Cloud, Check, AlertTriangle, WifiOff, Loader2 } from 'lucide-react';
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import './CloudSyncIndicator.css';

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

interface CloudSyncIndicatorProps {
  status: CloudSyncStatus;
  lastSyncedAt?: number;
  lastError?: string;
  onManualSync?: () => void;
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
}: CloudSyncIndicatorProps) {
  const [showSynced, setShowSynced] = useState(false);
  const prevStatusRef = useRef(status);
  const [timeStr, setTimeStr] = useState(() => lastSyncedAt ? formatSyncTime(lastSyncedAt) : '');

  // When status transitions to 'synced', show checkmark briefly then go idle
  useEffect(() => {
    if (status === 'synced' && prevStatusRef.current === 'syncing') {
      setShowSynced(true);
      const t = setTimeout(() => setShowSynced(false), 2000);
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
    if (status === 'syncing') return;
    onManualSync?.();
  }, [status, onManualSync]);

  // Derive visual state
  const effectiveStatus = showSynced ? 'synced' : status;

  const getTooltipContent = () => {
    const lines: { label: string; value: string; color?: string }[] = [];

    switch (effectiveStatus) {
      case 'syncing':
        lines.push({ label: 'Status', value: 'Saving...', color: 'var(--text-info)' });
        break;
      case 'synced':
        lines.push({ label: 'Status', value: 'All changes saved', color: 'var(--text-success)' });
        break;
      case 'error':
        lines.push({ label: 'Status', value: 'Save failed — will retry', color: 'var(--text-critical)' });
        if (lastError) {
          lines.push({ label: 'Error', value: lastError.length > 50 ? lastError.slice(0, 50) + '...' : lastError, color: 'var(--text-critical)' });
        }
        break;
      case 'offline':
        lines.push({ label: 'Status', value: 'Offline — saved locally', color: 'var(--text-warning)' });
        lines.push({ label: '', value: 'Will sync when online', color: 'var(--text-tertiary)' });
        break;
      default: // idle
        lines.push({ label: 'Status', value: 'All changes saved', color: 'var(--text-success)' });
        break;
    }

    if (lastSyncedAt) {
      lines.push({ label: 'Last saved', value: timeStr });
    }

    return lines;
  };

  const renderIcon = () => {
    switch (effectiveStatus) {
      case 'syncing':
        return (
          <div className="sync-icon-wrap">
            <Cloud size={16} style={{ color: 'var(--icon-primary)' }} />
            <div className="sync-icon-badge">
              <Loader2 size={10} style={{ color: 'var(--icon-info)', animation: 'spin 1s linear infinite' }} />
            </div>
          </div>
        );
      case 'synced':
        return (
          <div className="sync-icon-wrap">
            <Cloud size={16} style={{ color: 'var(--icon-primary)' }} />
            <div className="sync-icon-badge sync-icon-badge-bg">
              <Check size={10} style={{ color: 'var(--icon-success)' }} />
            </div>
          </div>
        );
      case 'error':
        return (
          <div className="sync-icon-wrap">
            <Cloud size={16} style={{ color: 'var(--icon-primary)' }} />
            <div className="sync-icon-badge sync-icon-badge-bg">
              <AlertTriangle size={10} style={{ color: 'var(--icon-critical)' }} />
            </div>
          </div>
        );
      case 'offline':
        return (
          <div className="sync-icon-wrap">
            <Cloud size={16} style={{ color: 'var(--icon-tertiary)' }} />
            <div className="sync-icon-badge sync-icon-badge-bg">
              <WifiOff size={10} style={{ color: 'var(--icon-warning)' }} />
            </div>
          </div>
        );
      default: // idle — clean cloud, no badge
        return <Cloud size={16} style={{ color: 'var(--icon-primary)' }} />;
    }
  };

  const tooltipLines = getTooltipContent();

  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            onClick={handleClick}
            disabled={status === 'syncing'}
            className={`sync-button${status === 'syncing' ? ' sync-button--pulsing' : ''}`}
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
                    <span className="sync-tooltip-value" style={{ color: line.color || 'var(--text-primary)' }}>
                      {line.value}
                    </span>
                  </div>
                ) : (
                  <div key={i} className="sync-tooltip-divider">
                    <span className="sync-tooltip-hint" style={{ color: line.color || 'var(--text-tertiary)' }}>
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
