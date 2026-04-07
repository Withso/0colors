// ConnectedPublishPopup — reads from Zustand store, passes props to PublishPopup.
// Moves the inline `getSnapshot` builder out of App.tsx.
import { useCallback } from 'react';
import { useStore } from '../store';
import { PublishPopup } from './PublishPopup';
import { CURRENT_SCHEMA_VERSION } from '../utils/migrations';
import type { ProjectSnapshot } from '../utils/supabase/cloud-sync';

interface ConnectedPublishPopupProps {
  /** Called after successful publish/unpublish to update local state */
  handlePublishChange: (projectId: string, published: boolean, slug?: string) => void;
}

export function ConnectedPublishPopup({
  handlePublishChange,
}: ConnectedPublishPopupProps) {
  // ── Store state ──
  const showPublishPopup = useStore(s => s.showPublishPopup);
  const setShowPublishPopup = useStore(s => s.setShowPublishPopup);
  const projects = useStore(s => s.projects);
  const allNodes = useStore(s => s.allNodes);
  const tokens = useStore(s => s.tokens);
  const groups = useStore(s => s.groups);
  const pages = useStore(s => s.pages);
  const themes = useStore(s => s.themes);
  const canvasStates = useStore(s => s.canvasStates);
  const advancedLogic = useStore(s => s.advancedLogic);
  const activeProjectId = useStore(s => s.activeProjectId);
  const authSession = useStore(s => s.authSession);

  // ── getSnapshot builder (moved from App.tsx inline) ──
  const getSnapshot = useCallback((): ProjectSnapshot => {
    const projectId = showPublishPopup!;
    const project = projects.find(p => p.id === projectId);
    if (!project) {
      return {
        project: { id: projectId, name: 'Untitled', isExpanded: true },
        nodes: [], tokens: [], groups: [], pages: [], themes: [],
        canvasStates: [], advancedLogic: [],
      } as any;
    }
    const pNodes = allNodes.filter(n => n.projectId === projectId);
    const pNodeIds = new Set(pNodes.map(n => n.id));
    return {
      project,
      nodes: pNodes,
      tokens: tokens.filter(t => t.projectId === projectId),
      groups: groups.filter(g => g.projectId === projectId),
      pages: pages.filter(p => p.projectId === projectId),
      themes: themes.filter(t => t.projectId === projectId),
      canvasStates: canvasStates.filter(cs => cs.projectId === projectId),
      advancedLogic: advancedLogic.filter(l => pNodeIds.has(l.nodeId)),
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
  }, [showPublishPopup, projects, allNodes, tokens, groups, pages, themes, canvasStates, advancedLogic]);

  // Don't render if not showing or no auth
  if (!showPublishPopup || !authSession) return null;

  return (
    <PublishPopup
      projectId={showPublishPopup}
      projectName={projects.find(p => p.id === showPublishPopup)?.name || 'Untitled'}
      accessToken={authSession.accessToken}
      nodes={allNodes}
      firstPageId={pages.filter(p => p.projectId === showPublishPopup).sort((a, b) => a.createdAt - b.createdAt)[0]?.id || ''}
      getSnapshot={getSnapshot}
      onClose={() => setShowPublishPopup(null)}
      onPublishChange={handlePublishChange}
    />
  );
}
