/**
 * useReadOnlyState — single source of truth for read-only/edit state.
 *
 * BEFORE: Each component derived isSampleMode/readOnly/isReadOnly independently,
 *         with inconsistent logic (some checked theme, some didn't, one used
 *         activeSampleTemplateId instead of project.isSample).
 *
 * AFTER: All components use this hook. The logic is:
 *   - isSampleMode:    project.isSample === true (sample projects are read-only)
 *   - isCommunityView: isCommunityMode from store (community projects are read-only)
 *   - canEdit:         !isSampleMode && !isCommunityView (the main guard for mutations)
 *   - isThemeReadOnly: canEdit is false OR the active theme is non-primary
 *                      (non-primary themes restrict some token/group editing)
 *
 * Note: ColorNodeCard has additional node-specific logic (isLinkedToPrimary)
 *       that stays in that component — it's not a global state concern.
 */

import { useStore } from '../store';

export interface ReadOnlyState {
  /** True when viewing a sample project */
  isSampleMode: boolean;
  /** True when viewing a community read-only project */
  isCommunityView: boolean;
  /** True when the user can make edits (not sample, not community) */
  canEdit: boolean;
  /** True when token/group editing is restricted (sample/community OR non-primary theme) */
  isThemeReadOnly: boolean;
  /** True when viewing the primary theme */
  isPrimaryTheme: boolean;
}

export function useReadOnlyState(): ReadOnlyState {
  const activeProjectId = useStore(s => s.activeProjectId);
  const projects = useStore(s => s.projects);
  const activeThemeId = useStore(s => s.activeThemeId);
  const themes = useStore(s => s.themes);
  const isCommunityMode = useStore(s => s.isCommunityMode);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const isSampleMode = activeProject?.isSample === true;
  const isCommunityView = isCommunityMode;
  const canEdit = !isSampleMode && !isCommunityView;

  const activeTheme = themes.find(t => t.id === activeThemeId);
  const isPrimaryTheme = activeTheme?.isPrimary === true;
  const isThemeReadOnly = !canEdit || !isPrimaryTheme;

  return {
    isSampleMode,
    isCommunityView,
    canEdit,
    isThemeReadOnly,
    isPrimaryTheme,
  };
}
