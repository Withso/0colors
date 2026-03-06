// ═══════════════════════════════════════════════════════════════════
// Advanced Draft Registry
// Tracks which nodes currently have an open AdvancedPopup.
// The reactive evaluation loop in App.tsx skips these nodes so that
// draft expressions aren't auto-evaluated while the user is editing.
// Evaluation only happens on explicit Save or Play actions.
// ═══════════════════════════════════════════════════════════════════

const _draftNodeIds = new Set<string>();

/** Mark a node as currently being edited in AdvancedPopup. */
export function registerAdvancedDraft(nodeId: string): void {
  _draftNodeIds.add(nodeId);
}

/** Remove the editing mark (popup closed or explicit Save/Play). */
export function unregisterAdvancedDraft(nodeId: string): void {
  _draftNodeIds.delete(nodeId);
}

/** Check if a node is currently being edited. */
export function isAdvancedDraft(nodeId: string): boolean {
  return _draftNodeIds.has(nodeId);
}
