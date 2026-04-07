// ConnectedCommandPalette — reads from Zustand store, passes props to CommandPalette
// This eliminates prop drilling from App.tsx while keeping CommandPalette's interface unchanged.
import { useStore } from '../../store';
import { useNodeCreation } from '../../store/useNodeCreation';
import { useTokenOperations } from '../../store/useTokenOperations';
import { usePageThemeOperations } from '../../store/usePageThemeOperations';
import { CommandPalette } from './CommandPalette';

interface ConnectedCommandPaletteProps {
  /**
   * Complex dispatch: switches page/theme, saves/restores per-theme selection,
   * selects node, sets viewMode to canvas, dispatches navigateToNode event.
   */
  onNavigateToNode: (nodeId: string, pageId: string, themeId: string) => void;
  /**
   * Dispatch: switches page if needed, sets viewMode to canvas,
   * dispatches highlightToken custom event.
   */
  onNavigateToToken: (tokenId: string, pageId: string) => void;
}

export function ConnectedCommandPalette({
  onNavigateToNode,
  onNavigateToToken,
}: ConnectedCommandPaletteProps) {
  // Entity state from store
  const allNodes = useStore(s => s.allNodes);
  const tokens = useStore(s => s.tokens);
  const groups = useStore(s => s.groups);
  const pages = useStore(s => s.pages);
  const themes = useStore(s => s.themes);
  const activeProjectId = useStore(s => s.activeProjectId);
  const activePageId = useStore(s => s.activePageId);
  const activeThemeId = useStore(s => s.activeThemeId);

  // UI state from store
  const showCommandPalette = useStore(s => s.showCommandPalette);
  const setShowCommandPalette = useStore(s => s.setShowCommandPalette);
  const setShowTokenTable = useStore(s => s.setShowTokenTable);
  const setViewMode = useStore(s => s.setViewMode);

  // Mutation hooks
  const { addRootNode, addPaletteNode, addTokenNode, addSpacingNode } = useNodeCreation();
  const { addToken } = useTokenOperations();
  const { handleCreatePage, handleCreateTheme, handleSwitchPage, handleSwitchTheme } = usePageThemeOperations();

  return (
    <CommandPalette
      isOpen={showCommandPalette}
      onClose={() => setShowCommandPalette(false)}
      allNodes={allNodes}
      tokens={tokens}
      groups={groups}
      pages={pages}
      themes={themes}
      activeProjectId={activeProjectId}
      activePageId={activePageId}
      activeThemeId={activeThemeId}
      onNavigateToNode={onNavigateToNode}
      onNavigateToToken={onNavigateToToken}
      onOpenTokenTable={() => {
        setShowTokenTable(true);
        setViewMode('canvas');
      }}
      onOpenCodeView={() => setViewMode('code')}
      onAddColorNode={(cs) => addRootNode(cs)}
      onAddPaletteNode={addPaletteNode}
      onAddTokenNode={addTokenNode}
      onAddSpacingNode={addSpacingNode}
      onCreatePage={handleCreatePage}
      onCreateTheme={handleCreateTheme}
      onAddVariable={() => addToken()}
      onSwitchPage={handleSwitchPage}
      onSwitchTheme={handleSwitchTheme}
    />
  );
}
