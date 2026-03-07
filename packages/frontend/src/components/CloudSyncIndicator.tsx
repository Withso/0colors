import { useState, useEffect, useRef, useCallback } from 'react';
import { Cloud, CloudOff, Check, AlertTriangle, WifiOff, Loader2 } from 'lucide-react';
import * as TooltipPrimitive from "@radix-ui/react-tooltip@1.1.8";

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
            <div className="h-7 w-7 flex items-center justify-center rounded text-[#444]">
              <CloudOff className="h-4 w-4" />
            </div>
          </TooltipPrimitive.Trigger>
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              side="bottom"
              sideOffset={6}
              className="z-[200] px-3 py-2 rounded-lg text-[12px] tracking-[-0.01em] text-[#ededed] bg-[#1a1a1a]/95 backdrop-blur-md border border-[#ffffff]/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.45)] animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-1 select-none"
            >
              <div className="flex flex-col gap-1">
                <span className="text-[#888]">Local project</span>
                <span className="text-[#555] text-[11px]">Not synced to cloud</span>
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
        lines.push({ label: 'Status', value: 'Syncing...', color: '#6b8598' });
        break;
      case 'synced':
        lines.push({ label: 'Status', value: 'All changes saved', color: '#6aab8a' });
        break;
      case 'error':
        lines.push({ label: 'Status', value: 'Sync failed', color: '#d47272' });
        if (lastError) {
          lines.push({ label: 'Error', value: lastError.length > 50 ? lastError.slice(0, 50) + '...' : lastError, color: '#d47272' });
        }
        break;
      case 'dirty':
        lines.push({ label: 'Status', value: `Unsaved changes${dirtyCount > 1 ? ` (${dirtyCount} projects)` : ''}`, color: '#d4aa55' });
        break;
      case 'offline':
        lines.push({ label: 'Status', value: 'Offline — will sync when online', color: '#d4aa55' });
        break;
      default: // idle
        lines.push({ label: 'Status', value: 'Up to date', color: '#6aab8a' });
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
          <div className="relative">
            <Cloud className="h-4 w-4 text-white" />
            <div className="absolute -bottom-0.5 -right-0.5">
              <Loader2 className="h-2.5 w-2.5 text-[#6b8598] animate-spin" />
            </div>
          </div>
        );
      case 'synced':
        return (
          <div className="relative">
            <Cloud className="h-4 w-4 text-white" />
            <div className="absolute -bottom-0.5 -right-0.5 bg-[#111111] rounded-full">
              <Check className="h-2.5 w-2.5 text-[#6aab8a]" strokeWidth={3} />
            </div>
          </div>
        );
      case 'error':
        return (
          <div className="relative">
            <Cloud className="h-4 w-4 text-white" />
            <div className="absolute -bottom-0.5 -right-0.5 bg-[#111111] rounded-full">
              <AlertTriangle className="h-2.5 w-2.5 text-[#d47272]" strokeWidth={3} />
            </div>
          </div>
        );
      case 'dirty':
        return (
          <div className="relative">
            <Cloud className="h-4 w-4 text-white" />
            <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#d4aa55]" />
          </div>
        );
      case 'offline':
        return (
          <div className="relative">
            <Cloud className="h-4 w-4 text-[#888]" />
            <div className="absolute -bottom-0.5 -right-0.5 bg-[#111111] rounded-full">
              <WifiOff className="h-2.5 w-2.5 text-[#d4aa55]" strokeWidth={3} />
            </div>
          </div>
        );
      default: // idle
        return <Cloud className="h-4 w-4 text-white" />;
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
            className={`h-7 w-7 flex items-center justify-center rounded transition-all ${
              isClickable ? 'hover:bg-[#ffffff]/[0.08] cursor-pointer' : 'cursor-wait'
            } ${effectiveStatus === 'syncing' ? 'animate-pulse' : ''}`}
            aria-label="Cloud sync status"
          >
            {renderIcon()}
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="bottom"
            sideOffset={6}
            className="z-[200] px-3 py-2.5 rounded-lg text-[12px] tracking-[-0.01em] text-[#ededed] bg-[#1a1a1a]/95 backdrop-blur-md border border-[#ffffff]/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.45)] animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-1 select-none max-w-[220px]"
          >
            <div className="flex flex-col gap-1.5">
              {tooltipLines.map((line, i) => (
                line.label ? (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="text-[#666] text-[11px]">{line.label}</span>
                    <span className="text-[11px] text-right" style={{ color: line.color || '#ededed' }}>
                      {line.value}
                    </span>
                  </div>
                ) : (
                  <div key={i} className="border-t border-[#ffffff]/[0.06] pt-1.5 mt-0.5">
                    <span className="text-[11px]" style={{ color: line.color || '#888' }}>
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