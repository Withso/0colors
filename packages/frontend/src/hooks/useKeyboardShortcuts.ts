import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useNodeMutations } from '../store/useNodeMutations';

/**
 * Centralised keyboard-shortcut handler extracted from AppShell.
 *
 * Handles:
 *  - Cmd/Ctrl+K  → toggle command palette
 *  - Cmd/Ctrl+Shift+A → toggle AI chat
 *  - Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z → undo / redo
 *  - Cmd/Ctrl+C / V / D → copy / paste / duplicate
 *  - Delete / Backspace → delete node(s)
 *  - Escape → deselect
 *  - O → toggle "show all visible"
 *  - Alt+T → auto-assign trigger
 *  - Alt+F → open advanced logic popup
 *  - 1-9 → switch themes
 */
export function useKeyboardShortcuts(
  handleSwitchThemeRef: React.RefObject<((themeId: string) => void) | null>,
  isSampleModeRef: React.RefObject<boolean>,
  sampleModeToast: (action?: string) => void,
) {
  const selectedNodeId = useStore(s => s.selectedNodeId);
  const setSelectedNodeId = useStore(s => s.setSelectedNodeId);
  const selectedNodeIds = useStore(s => s.selectedNodeIds);
  const setSelectedNodeIds = useStore(s => s.setSelectedNodeIds);
  const copiedNodes = useStore(s => s.copiedNodes);
  const themes = useStore(s => s.themes);
  const activeProjectId = useStore(s => s.activeProjectId);
  const activeThemeId = useStore(s => s.activeThemeId);

  const setShowCommandPalette = useStore(s => s.setShowCommandPalette);
  const setShowAIChat = useStore(s => s.setShowAIChat);
  const setShowAllVisible = useStore(s => s.setShowAllVisible);
  const setAutoAssignTriggerNodeId = useStore(s => s.setAutoAssignTriggerNodeId);

  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);

  const { copyNode, pasteNodes, duplicateNode, deleteNode } = useNodeMutations();

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input field - if so, ignore keyboard shortcuts
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Actions with Cmd/Ctrl+K (works globally)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
        return;
      }

      // Toggle Ask AI with Ctrl/Cmd+Shift+A (works globally)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setShowAIChat(prev => !prev);
        return;
      }

      // Undo with Cmd/Ctrl+Z (works globally — all views)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        if (isTyping) return; // allow native undo inside text inputs
        e.preventDefault();
        if (isSampleModeRef.current) { sampleModeToast('Undo'); return; }
        undo();
        return;
      }

      // Redo with Cmd/Ctrl+Shift+Z (works globally)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && e.shiftKey) {
        if (isTyping) return;
        e.preventDefault();
        if (isSampleModeRef.current) { sampleModeToast('Redo'); return; }
        redo();
        return;
      }

      // Copy with Cmd/Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedNodeId && !isTyping) {
        e.preventDefault();
        if (selectedNodeIds.length > 1) {
          copyNode(selectedNodeIds);
        } else {
          copyNode(selectedNodeId);
        }
        return;
      }

      // Paste with Cmd/Ctrl+V
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && copiedNodes.length > 0 && !isTyping) {
        e.preventDefault();
        pasteNodes();
        return;
      }

      // Duplicate with Cmd/Ctrl+D
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedNodeId && !isTyping) {
        e.preventDefault();
        if (selectedNodeIds.length > 1) {
          duplicateNode(selectedNodeIds);
        } else {
          duplicateNode(selectedNodeId);
        }
        return;
      }

      // Delete with Delete or Backspace - only if NOT typing in an input field
      // Also block when advanced popup is open (node shouldn't be deleted while editing logic)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping) {
        if (document.body.hasAttribute('data-advanced-popup-open')) return;
        if (isSampleModeRef.current) { e.preventDefault(); sampleModeToast('Deleting'); return; }
        e.preventDefault();

        // Delete multi-selected nodes
        if (selectedNodeIds.length > 0) {
          selectedNodeIds.forEach(nodeId => deleteNode(nodeId));
          setSelectedNodeIds([]);
          setSelectedNodeId(null);
        }
        // Delete single selected node
        else if (selectedNodeId) {
          deleteNode(selectedNodeId);
          setSelectedNodeId(null);
        }
      }

      // Deselect with Escape
      if (e.key === 'Escape') {
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
      }

      // Toggle "show all visible" with O key (non-primary themes only)
      if ((e.key === 'o' || e.key === 'O') && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping) {
        setShowAllVisible(prev => !prev);
      }

      // Open auto-assign token popup with Alt/Opt+T
      // Use e.code because macOS Option+T produces '\u2020' for e.key
      if (e.altKey && e.code === 'KeyT' && !e.metaKey && !e.ctrlKey && !isTyping) {
        e.preventDefault();
        if (selectedNodeId) {
          setAutoAssignTriggerNodeId(selectedNodeId);
        }
      }

      // Open Advanced Logic popup with Alt/Opt+F
      // Use e.code because macOS Option+F produces '\u0192' for e.key
      if (e.altKey && e.code === 'KeyF' && !e.metaKey && !e.ctrlKey && !isTyping) {
        e.preventDefault();
        if (selectedNodeId) {
          window.dispatchEvent(new CustomEvent('openAdvancedPopup', { detail: { nodeId: selectedNodeId } }));
        }
      }

      // Switch themes with 1-9 keys (first 9 themes in the active project)
      if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 9) {
          const projectThemes = themes
            .filter(t => t.projectId === activeProjectId)
            .sort((a, b) => a.createdAt - b.createdAt);
          const targetTheme = projectThemes[num - 1];
          if (targetTheme && targetTheme.id !== activeThemeId) {
            e.preventDefault();
            handleSwitchThemeRef.current?.(targetTheme.id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedNodeIds, copiedNodes, duplicateNode, deleteNode, copyNode, pasteNodes, undo, redo, themes, activeProjectId, activeThemeId]);
}
