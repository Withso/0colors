// ═══════════════════════════════════════════════════════════════════
// Build Action Preview — shows pending AI tool calls for user approval
// ═══════════════════════════════════════════════════════════════════

import { Check, X, Play, AlertCircle } from 'lucide-react';
import type { ToolCall, ToolResult } from '../../utils/ai-build-tools';
import './BuildActionPreview.css';

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
      className="build-preview-card"
      style={{
        background: 'color-mix(in srgb, var(--indigo-400) 6%, transparent)',
        border: '1px solid color-mix(in srgb, var(--indigo-400) 15%, transparent)',
      }}
    >
      <div className="build-preview-header"
        style={{ borderBottom: '1px solid color-mix(in srgb, var(--indigo-400) 10%, transparent)' }}
      >
        <span className="build-preview-header-text" style={{ color: 'var(--blue-500)' }}>
          Proposed Actions ({toolCalls.length})
        </span>
      </div>

      <div className="build-preview-list">
        {descriptions.map((desc, i) => (
          <div key={i} className="build-preview-item">
            <span className="build-preview-item-number">{i + 1}.</span>
            <span>{desc}</span>
          </div>
        ))}
      </div>

      <div className="build-preview-actions"
        style={{ borderTop: '1px solid color-mix(in srgb, var(--indigo-400) 10%, transparent)' }}
      >
        <button
          onClick={onApply}
          disabled={disabled}
          className="build-preview-btn build-preview-btn--apply"
        >
          <Play size={9} /> Apply All
        </button>
        <button
          onClick={onSkip}
          disabled={disabled}
          className="build-preview-btn build-preview-btn--secondary"
        >
          Skip
        </button>
        <button
          onClick={onCancel}
          disabled={disabled}
          className="build-preview-btn build-preview-btn--secondary"
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
    <div className="build-preview-executed-item">
      {result.success ? (
        <Check size={10} className="build-preview-executed-icon" style={{ color: 'var(--green-500)' }} />
      ) : (
        <AlertCircle size={10} className="build-preview-executed-icon" style={{ color: 'var(--red-500)' }} />
      )}
      <span style={{ color: result.success ? 'var(--grey-500)' : 'var(--red-500)' }}>
        {description}
        {!result.success && result.error && (
          <span className="build-preview-error-hint"> -- {result.error}</span>
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
      className="build-preview-summary"
      style={{
        background: 'color-mix(in srgb, var(--green-500) 4%, transparent)',
        border: failCount > 0
          ? '1px solid color-mix(in srgb, var(--red-500) 12%, transparent)'
          : '1px solid color-mix(in srgb, var(--green-500) 12%, transparent)',
      }}
    >
      <div className="build-preview-summary-header"
        style={{ borderBottom: '1px solid color-mix(in srgb, var(--grey-50) 4%, transparent)' }}
      >
        <span className="build-preview-summary-label" style={{ color: failCount > 0 ? 'var(--red-500)' : 'var(--green-500)' }}>
          {successCount} action{successCount !== 1 ? 's' : ''} applied
          {failCount > 0 && `, ${failCount} failed`}
        </span>
      </div>
      <div className="build-preview-summary-body">
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
      className="build-preview-badge"
      style={{
        background: 'color-mix(in srgb, var(--orange-400) 12%, transparent)',
        color: 'var(--orange-400)',
      }}
    >
      Build
    </span>
  );
}
