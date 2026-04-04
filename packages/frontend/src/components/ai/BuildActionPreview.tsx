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
        background: 'rgba(139,143,255,0.06)',
        border: '1px solid rgba(139,143,255,0.15)',
      }}
    >
      <div className="build-preview-header"
        style={{ borderBottom: '1px solid rgba(139,143,255,0.1)' }}
      >
        <span className="build-preview-header-text" style={{ color: 'var(--indigo-400)' }}>
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
        style={{ borderTop: '1px solid rgba(139,143,255,0.1)' }}
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
        background: 'rgba(43,189,104,0.04)',
        border: `1px solid rgba(${failCount > 0 ? '255,77,106' : '43,189,104'}, 0.12)`,
      }}
    >
      <div className="build-preview-summary-header"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
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
      style={{ background: 'rgba(255,160,50,0.12)', color: '#FFA032' }}
    >
      Build
    </span>
  );
}
