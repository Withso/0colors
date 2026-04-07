// ConnectedMultiPageExport — reads from Zustand store, passes props to MultiPageExport
// This eliminates prop drilling from App.tsx while keeping MultiPageExport's interface unchanged.
import { useStore } from '../store';
import { MultiPageExport } from './MultiPageExport';
import type { ProjectComputedTokens } from '../utils/computed-tokens';

interface ConnectedMultiPageExportProps {
  /** computedTokens must be passed in because it comes from useCloudSyncAuth's ref */
  computedTokens?: ProjectComputedTokens;
}

export function ConnectedMultiPageExport({ computedTokens }: ConnectedMultiPageExportProps) {
  // Entity state from store
  const tokens = useStore(s => s.tokens);
  const allNodes = useStore(s => s.allNodes);
  const groups = useStore(s => s.groups);
  const pages = useStore(s => s.pages);
  const themes = useStore(s => s.themes);
  const activeProjectId = useStore(s => s.activeProjectId);
  const activeThemeId = useStore(s => s.activeThemeId);
  const advancedLogic = useStore(s => s.advancedLogic);

  // Export state from store (auth slice)
  const multiExportPageIds = useStore(s => s.multiExportPageIds);
  const setMultiExportPageIds = useStore(s => s.setMultiExportPageIds);
  const multiExportThemeIds = useStore(s => s.multiExportThemeIds);
  const setMultiExportThemeIds = useStore(s => s.setMultiExportThemeIds);
  const multiExportHexSpaces = useStore(s => s.multiExportHexSpaces);
  const setMultiExportHexSpaces = useStore(s => s.setMultiExportHexSpaces);

  return (
    <MultiPageExport
      pages={pages}
      tokens={tokens}
      tokenGroups={groups}
      nodes={allNodes}
      activeProjectId={activeProjectId}
      themes={themes}
      activeThemeId={activeThemeId}
      selectedPageIds={multiExportPageIds}
      onSelectedPageIdsChange={setMultiExportPageIds}
      selectedThemeIds={multiExportThemeIds}
      onSelectedThemeIdsChange={setMultiExportThemeIds}
      hexOverrideSpaces={multiExportHexSpaces}
      onHexOverrideSpacesChange={setMultiExportHexSpaces}
      advancedLogic={advancedLogic}
      computedTokens={computedTokens}
    />
  );
}
