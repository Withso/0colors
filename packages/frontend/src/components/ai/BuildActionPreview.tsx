// ═══════════════════════════════════════════════════════════════════
// Build Action Preview — shows pending AI tool calls for user approval
// ═══════════════════════════════════════════════════════════════════

import { Check, X, Play, AlertCircle } from 'lucide-react';
import type { ToolCall, ToolResult } from '../../utils/ai-build-tools';

// ── Pending Actions Card (before execution) ────────────────────────

interface PendingActionsProps {
  toolCalls: ToolCall[];
  descriptions: string[];
  onApply: () => void;
  onSkip: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function PendingActionsCard({ toolCalls, descriptions, onApply, onSkip, onCancel, disabled }: PendingActionsProps) {
  return (
    <div
      className="rounded-lg overflow-hidden my-2"
      style={{
        background: 'rgba(139,143,255,0.06)',
        border: '1px solid rgba(139,143,255,0.15)',
      }}
    >
      <div className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(139,143,255,0.1)' }}
      >
        <span className="text-[11px] font-medium" style={{ color: 'var(--ai)' }}>
          Proposed Actions ({toolCalls.length})
        </span>
      </div>

      <div className="px-3 py-2 space-y-1">
        {descriptions.map((desc, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px] text-subtle">
            <span className="text-ghost shrink-0 mt-[1px]">{i + 1}.</span>
            <span>{desc}</span>
          </div>
        ))}
      </div>

      <div className="px-3 py-2 flex items-center gap-2"
        style={{ borderTop: '1px solid rgba(139,143,255,0.1)' }}
      >
        <button
          onClick={onApply}
          disabled={disabled}
          className="flex items-center gap-1 h-6 px-2.5 rounded text-[10px] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-default"
          style={{ background: 'rgba(139,143,255,0.2)', color: 'var(--ai)' }}
        >
          <Play size={9} /> Apply All
        </button>
        <button
          onClick={onSkip}
          disabled={disabled}
          className="flex items-center gap-1 h-6 px-2.5 rounded text-[10px] cursor-pointer transition-colors hover:bg-white/5 disabled:opacity-50 disabled:cursor-default"
          style={{ color: 'var(--dim)' }}
        >
          Skip
        </button>
        <button
          onClick={onCancel}
          disabled={disabled}
          className="flex items-center gap-1 h-6 px-2.5 rounded text-[10px] cursor-pointer transition-colors hover:bg-white/5 disabled:opacity-50 disabled:cursor-default"
          style={{ color: 'var(--dim)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Executed Action Item (after execution) ─────────────────────────

interface ExecutedActionProps {
  description: string;
  result: ToolResult;
}

export function ExecutedActionItem({ description, result }: ExecutedActionProps) {
  return (
    <div className="flex items-start gap-2 text-[11px] py-0.5">
      {result.success ? (
        <Check size={10} className="shrink-0 mt-[2px]" style={{ color: '#2BBD68' }} />
      ) : (
        <AlertCircle size={10} className="shrink-0 mt-[2px]" style={{ color: '#FF4D6A' }} />
      )}
      <span style={{ color: result.success ? 'var(--subtle)' : '#FF4D6A' }}>
        {description}
        {!result.success && result.error && (
          <span className="text-ghost ml-1">— {result.error}</span>
        )}
      </span>
    </div>
  );
}

// ── Executed Actions Summary (shown inline in chat) ────────────────

interface ExecutedActionsSummaryProps {
  actions: { description: string; result: ToolResult }[];
}

export function ExecutedActionsSummary({ actions }: ExecutedActionsSummaryProps) {
  if (actions.length === 0) return null;

  const successCount = actions.filter(a => a.result.success).length;
  const failCount = actions.length - successCount;

  return (
    <div
      className="rounded-lg overflow-hidden my-2"
      style={{
        background: 'rgba(43,189,104,0.04)',
        border: `1px solid rgba(${failCount > 0 ? '255,77,106' : '43,189,104'},0.12)`,
      }}
    >
      <div className="px-3 py-1.5 flex items-center gap-2"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <span className="text-[10px] font-medium" style={{ color: failCount > 0 ? '#FF4D6A' : '#2BBD68' }}>
          {successCount} action{successCount !== 1 ? 's' : ''} applied
          {failCount > 0 && `, ${failCount} failed`}
        </span>
      </div>
      <div className="px-3 py-1.5 space-y-0.5">
        {actions.map((a, i) => (
          <ExecutedActionItem key={i} description={a.description} result={a.result} />
        ))}
      </div>
    </div>
  );
}

// ── Build Mode Badge (shown in header) ─────────────────────────────

export function BuildModeBadge() {
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-medium"
      style={{ background: 'rgba(255,160,50,0.12)', color: '#FFA032' }}
    >
      Build
    </span>
  );
}
