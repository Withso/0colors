// ConnectedCodePreview — reads from Zustand store, passes props to CodePreview
// This eliminates prop drilling from App.tsx while keeping CodePreview's interface unchanged.
import { useStore } from '../store';
import { CodePreview } from './CodePreview';
import type { ProjectComputedTokens } from '../utils/computed-tokens';

interface ConnectedCodePreviewProps {
  /** computedTokens must be passed in because it comes from useCloudSyncAuth's ref */
  computedTokens?: ProjectComputedTokens;
}

export function ConnectedCodePreview({ computedTokens }: ConnectedCodePreviewProps) {
  // Entity state from store
  const tokens = useStore(s => s.tokens);
  const allNodes = useStore(s => s.allNodes);
  const groups = useStore(s => s.groups);
  const pages = useStore(s => s.pages);
  const themes = useStore(s => s.themes);
  const activeProjectId = useStore(s => s.activeProjectId);
  const activePageId = useStore(s => s.activePageId);
  const activeThemeId = useStore(s => s.activeThemeId);
  const advancedLogic = useStore(s => s.advancedLogic);

  // Export state from store (auth slice)
  const codePreviewHexByPage = useStore(s => s.codePreviewHexByPage);
  const setCodePreviewHexByPage = useStore(s => s.setCodePreviewHexByPage);

  // Derived state
  const pageTokens = tokens.filter(t => t.projectId === activeProjectId && t.pageId === activePageId);
  const pageGroups = groups.filter(g => g.projectId === activeProjectId && g.pageId === activePageId);
  const nodes = allNodes.filter(n => n.projectId === activeProjectId && n.pageId === activePageId);
  const allProjectTokens = tokens.filter(t => t.projectId === activeProjectId);
  const allProjectNodes = allNodes.filter(n => n.projectId === activeProjectId);
  const activePage = pages.find(p => p.id === activePageId);

  return (
    <CodePreview
      tokens={pageTokens}
      tokenGroups={pageGroups}
      nodes={nodes}
      allProjectTokens={allProjectTokens}
      allProjectNodes={allProjectNodes}
      activePage={activePage}
      themes={themes}
      activeThemeId={activeThemeId}
      hexOverridesByPage={codePreviewHexByPage}
      onHexOverridesByPageChange={setCodePreviewHexByPage}
      advancedLogic={advancedLogic}
      computedTokens={computedTokens}
    />
  );
}
