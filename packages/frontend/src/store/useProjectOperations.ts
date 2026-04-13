// Project operation callbacks extracted from App.tsx
import { useCallback, useMemo } from 'react';
import type { ColorNode, DesignToken, TokenProject, TokenGroup, CanvasState, Page, Theme, NodeAdvancedLogic } from '../types';
import { slugify } from '../utils/slugify';
import { toast } from 'sonner';
import {
  registerCloudProject, unregisterCloudProject,
  removeDirty,
} from '../utils/supabase/cloud-sync';
import type { SampleTemplate } from '../utils/sample-templates';
import { useStore } from './index';
import { useReadOnlyState } from '../hooks/useReadOnlyState';
import { lockManager } from '../sync/session-lock';

interface UseProjectOperationsParams {
  // Refs that live in App.tsx — cannot be read from the store
  authSessionRef: React.MutableRefObject<{ accessToken: string; userId: string; email: string; name: string; isAdmin?: boolean; isTemplateAdmin?: boolean } | null>;
  lastSyncedAtMapRef: React.MutableRefObject<Record<string, number>>;
  lastSyncedPathnameRef: React.MutableRefObject<string>;
  activeThemeIdRef: React.MutableRefObject<string>;
  selectedNodeIdRef: React.MutableRefObject<string | null>;
  selectedNodeIdsRef: React.MutableRefObject<string[]>;
  themeSelectionsRef: React.MutableRefObject<Record<string, { selectedNodeId: string | null; selectedNodeIds: string[] }>>;
  viewingProjectsRef: React.MutableRefObject<boolean>;
  communityLoadedRef: React.MutableRefObject<boolean>;
  // Non-store state from App.tsx
  isCommunityMode: boolean;
  activeSampleTemplateId: string;
  sampleTemplates: SampleTemplate[];
  activeSampleIdx: number;
  // Navigation / React Router wrappers
  navigate: (path: string, options?: any) => void;
  _setViewingProjects: React.Dispatch<React.SetStateAction<boolean>>;
  _setViewMode: React.Dispatch<React.SetStateAction<'canvas' | 'code' | 'export'>>;
  setDashboardSection: React.Dispatch<React.SetStateAction<'projects' | 'community' | 'ai-settings' | 'profile' | 'qa-hub'>>;
  setIsCommunityMode: React.Dispatch<React.SetStateAction<boolean>>;
  setCommunitySlug: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useProjectOperations({
  authSessionRef, lastSyncedAtMapRef,
  lastSyncedPathnameRef, activeThemeIdRef, selectedNodeIdRef, selectedNodeIdsRef,
  themeSelectionsRef,
  viewingProjectsRef, communityLoadedRef,
  isCommunityMode, activeSampleTemplateId,
  sampleTemplates, activeSampleIdx,
  _setViewingProjects, _setViewMode, setDashboardSection,
  setIsCommunityMode, setCommunitySlug,
  navigate,
}: UseProjectOperationsParams) {
  // ── Read entity state + setters from Zustand store ──
  const projects = useStore(s => s.projects);
  const allNodes = useStore(s => s.allNodes);
  const tokens = useStore(s => s.tokens);
  const groups = useStore(s => s.groups);
  const pages = useStore(s => s.pages);
  const themes = useStore(s => s.themes);
  const canvasStates = useStore(s => s.canvasStates);
  const advancedLogic = useStore(s => s.advancedLogic);
  const activeProjectId = useStore(s => s.activeProjectId);
  // activePageId and activeThemeId are not directly used in this hook's body;
  // they are accessed via refs (activeThemeIdRef) or set via setters.

  const setProjects = useStore(s => s.setProjects);
  const setAllNodes = useStore(s => s.setAllNodes);
  const setTokens = useStore(s => s.setTokens);
  const setGroups = useStore(s => s.setGroups);
  const setPages = useStore(s => s.setPages);
  const setThemes = useStore(s => s.setThemes);
  const setCanvasStates = useStore(s => s.setCanvasStates);
  const setAdvancedLogic = useStore(s => s.setAdvancedLogic);
  const setActiveProjectId = useStore(s => s.setActiveProjectId);
  const setActivePageId = useStore(s => s.setActivePageId);
  const setActiveThemeId = useStore(s => s.setActiveThemeId);

  // ── UI state + setters from Zustand store ──
  const showPublishPopup = useStore(s => s.showPublishPopup);
  const setSelectedNodeId = useStore(s => s.setSelectedNodeId);
  const setSelectedNodeIds = useStore(s => s.setSelectedNodeIds);
  const setHighlightedProjectId = useStore(s => s.setHighlightedProjectId);

  // ── Local sample-mode guard (derived from store) ──
  const { isSampleMode } = useReadOnlyState();
  const sampleModeToast = useCallback((action?: string) => {
    toast('Duplicate this project to make changes', {
      description: action ? `${action} is not available in sample mode` : undefined,
      duration: 3000,
    });
  }, []);

  const addProject = useCallback((type: 'cloud' | 'template' = 'cloud'): boolean => {
    // Block creating projects while *editing* a sample canvas, but allow from the
    // projects dashboard even if activeProjectId still points at the sample project.
    if (isSampleMode && !viewingProjectsRef.current) {
      sampleModeToast('Creating projects');
      return false;
    }
    const isTemplate = type === 'template';

    // Enforce 20-project limit for regular projects (admins are exempt)
    const isAdmin = authSessionRef.current?.isAdmin;
    if (!isAdmin && !isTemplate && projects.filter(p => !p.isTemplate && !p.isSample).length >= 20) {
      toast.error('Project limit reached (max 20)');
      return false;
    }

    let counter = 1;
    let newName = isTemplate ? `Template ${counter}` : `Project ${counter}`;

    while (projects.some(p => p.name.toLowerCase() === newName.toLowerCase())) {
      counter++;
      newName = isTemplate ? `Template ${counter}` : `Project ${counter}`;
    }

    const timestamp = Date.now();
    const newProjectId = `project-${timestamp}`;
    const newPageId = `page-${timestamp}`;

    const newProject: TokenProject = {
      id: newProjectId,
      name: newName,
      isExpanded: true,
      isSample: false,
      folderColor: Math.floor(Math.random() * 360),
      isCloud: true, // All projects are cloud-backed
      isTemplate,
    };
    setProjects(prev => [...prev, newProject]);

    // Register project with backend
    if (authSessionRef.current) {
      registerCloudProject(newProjectId, authSessionRef.current.accessToken).then(result => {
        if (!result.ok) {
          console.log(`☁️ Cloud registration failed: ${result.error}`);
          toast.error(`Failed to register ${isTemplate ? 'template' : ''} project: ${result.error}`);
        } else {
          // Write-through handles sync via persistence middleware
        }
      });
    }

    // Create default page for the new project
    const newPage: Page = {
      id: newPageId,
      name: 'Page 1',
      projectId: newProjectId,
      createdAt: timestamp,
    };
    setPages(prev => [...prev, newPage]);

    // Create canvas state for the new page
    const newCanvasState: CanvasState = {
      projectId: newProjectId,
      pageId: newPageId,
      pan: { x: 0, y: 0 },
      zoom: 1,
    };
    setCanvasStates(prev => [...prev, newCanvasState]);

    // Create default primary theme for the new project
    const newThemeId = `theme-${timestamp}`;
    const newTheme: Theme = {
      id: newThemeId,
      name: 'Light',
      projectId: newProjectId,
      createdAt: timestamp,
      isPrimary: true, // First theme is always primary
    };
    setThemes(prev => [...prev, newTheme]);

    const newNode: ColorNode = {
      id: `node-${timestamp + 1}`,
      colorSpace: 'hsl',
      hue: Math.floor(Math.random() * 360),
      saturation: 70,
      lightness: 50,
      alpha: 100,
      position: { x: 100, y: 200 },
      parentId: null,
      hueOffset: 0,
      saturationOffset: 0,
      lightnessOffset: 0,
      alphaOffset: 0,
      tokenId: null,
      tokenIds: [],
      width: 240,
      projectId: newProjectId,
      pageId: newPageId,
      lockHue: false,
      lockSaturation: false,
      lockLightness: false,
      lockAlpha: false,
      lockRed: false,
      lockGreen: false,
      lockBlue: false,
      diffHue: true,
      diffSaturation: true,
      diffLightness: true,
      diffAlpha: true,
      diffRed: true,
      diffGreen: true,
      diffBlue: true,
      isExpanded: false,
    };
    setAllNodes(prev => [...prev, newNode]);

    // Save current theme's selection before switching to new project
    themeSelectionsRef.current[activeThemeIdRef.current] = {
      selectedNodeId: selectedNodeIdRef.current,
      selectedNodeIds: [...selectedNodeIdsRef.current],
    };
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setActiveProjectId(newProjectId);
    setActivePageId(newPageId);
    setActiveThemeId(newThemeId); // Set the new theme as active
    return true;
  }, [projects, isSampleMode, sampleModeToast]);

  const deleteProject = useCallback((projectId: string) => {
    if (isSampleMode) { sampleModeToast('Deleting projects'); return; }
    const projectToDelete = projects.find(p => p.id === projectId);
    if (!projectToDelete) return;

    // If cloud or template project, unregister from backend
    if ((projectToDelete.isCloud || projectToDelete.isTemplate) && authSessionRef.current) {
      unregisterCloudProject(projectId, authSessionRef.current.accessToken).catch(e => {
        console.log(`Failed to unregister cloud/template project ${projectId}: ${e}`);
      });
      // Clean up sync timestamp so reconciliation doesn't skip re-adding if undone
      delete lastSyncedAtMapRef.current[projectId];
      // Remove from dirty set so flushDirtyProjects doesn't try to re-upload
      removeDirty(projectId);
    }

    // Collect node IDs belonging to this project for advancedLogic cleanup
    const projectNodeIds = new Set(allNodes.filter(n => n.projectId === projectId).map(n => n.id));

    setAllNodes(prev => prev.filter(n => n.projectId !== projectId));
    setGroups(prev => prev.filter(g => g.projectId !== projectId));
    setTokens(prev => prev.filter(t => t.projectId !== projectId));
    setPages(prev => prev.filter(p => p.projectId !== projectId));
    setThemes(prev => prev.filter(t => t.projectId !== projectId));
    setCanvasStates(prev => prev.filter(cs => cs.projectId !== projectId));

    // Clean up advancedLogic entries for deleted project's nodes
    if (projectNodeIds.size > 0) {
      setAdvancedLogic(prev => {
        const filtered = prev.filter(l => !projectNodeIds.has(l.nodeId));
        return filtered.length === prev.length ? prev : filtered;
      });
    }

    if (activeProjectId === projectId) {
      const remainingProjects = projects.filter(p => p.id !== projectId);
      if (remainingProjects.length > 0) {
        setActiveProjectId(remainingProjects[0].id);
      } else {
        // Create a new default project if no projects remain
        const newProjectId = `project-${Date.now()}`;
        const newProject: Project = {
          id: newProjectId,
          name: 'Untitled Project',
          isExpanded: true,
          folderColor: Math.floor(Math.random() * 360),
        };
        setProjects([newProject]);
        setActiveProjectId(newProjectId);
        const newCanvasState: CanvasState = {
          projectId: newProjectId,
          offset: { x: 0, y: 0 },
          zoom: 1
        };
        setCanvasStates([newCanvasState]);
        return;
      }
    }

    setProjects(prev => prev.filter(p => p.id !== projectId));
  }, [projects, activeProjectId, isSampleMode, sampleModeToast]);

  const duplicateProject = useCallback((projectId: string) => {
    const projectToDuplicate = projects.find(p => p.id === projectId);
    if (!projectToDuplicate) return;

    const timestamp = Date.now();
    const newProjectId = `project-${timestamp}`;

    // All duplicated projects are cloud-backed (no local projects)
    const isAdmin = authSessionRef.current?.isAdmin;
    const existingCount = projects.filter(p => !p.isTemplate && !p.isSample).length;
    if (!isAdmin && existingCount >= 20) {
      toast.error('Project limit reached (max 20)');
      return;
    }

    const newProject: TokenProject = {
      id: newProjectId,
      name: `${projectToDuplicate.name} (Copy)`,
      isExpanded: true,
      isSample: false,
      folderColor: Math.floor(Math.random() * 360),
      isCloud: true, // All projects are cloud-backed
    };

    // ── Build ALL ID remapping tables ──

    // 1. Page ID map
    const projectPages = pages.filter(p => p.projectId === projectId);
    const pageIdMap = new Map<string, string>();
    projectPages.forEach((page, i) => {
      pageIdMap.set(page.id, `page-${timestamp}-${i}`);
    });

    // 2. Theme ID map
    const projectThemes = themes.filter(t => t.projectId === projectId);
    const themeIdMap = new Map<string, string>();
    projectThemes.forEach((theme, i) => {
      themeIdMap.set(theme.id, `theme-${timestamp}-${i}`);
    });

    // 3. Node ID map
    const projectNodes = allNodes.filter(n => n.projectId === projectId);
    const oldToNewIdMap = new Map<string, string>();
    projectNodes.forEach(node => {
      oldToNewIdMap.set(node.id, `node-${timestamp}-${node.id}`);
    });

    // 4. Group ID map
    const projectGroups = groups.filter(g => g.projectId === projectId);
    const groupIdMap = new Map<string, string>();
    projectGroups.forEach(group => {
      groupIdMap.set(group.id, `group-${timestamp}-${group.id}`);
    });

    // 5. Token ID map
    const projectTokens = tokens.filter(t => t.projectId === projectId);
    const tokenIdMap = new Map<string, string>();
    projectTokens.forEach((token, i) => {
      tokenIdMap.set(token.id, `token-${timestamp}-${i}`);
    });

    // ── Helper: remap theme-keyed dictionaries ──
    const remapThemeKeys = <T,>(dict: Record<string, T> | undefined): Record<string, T> | undefined => {
      if (!dict) return dict;
      const remapped: Record<string, T> = {};
      for (const [oldThemeId, value] of Object.entries(dict)) {
        const newThemeId = themeIdMap.get(oldThemeId) || oldThemeId;
        remapped[newThemeId] = value;
      }
      return remapped;
    };

    // ── Helper: remap token IDs in a string[] array ──
    const remapTokenIdArray = (arr: string[]): string[] =>
      arr.map(tid => tokenIdMap.get(tid) || tid);

    // ── Helper: remap theme-keyed token assignment dicts ──
    const remapTokenAssignments = (
      assignments: { [themeId: string]: string[] } | undefined
    ): { [themeId: string]: string[] } | undefined => {
      if (!assignments) return assignments;
      const remapped: { [themeId: string]: string[] } = {};
      for (const [oldThemeId, tokenIds] of Object.entries(assignments)) {
        const newThemeId = themeIdMap.get(oldThemeId) || oldThemeId;
        remapped[newThemeId] = remapTokenIdArray(tokenIds);
      }
      return remapped;
    };

    // ── Helper: remap theme-keyed single-value token assignments ──
    const remapValueTokenAssignments = (
      assignments: { [themeId: string]: string } | undefined
    ): { [themeId: string]: string } | undefined => {
      if (!assignments) return assignments;
      const remapped: { [themeId: string]: string } = {};
      for (const [oldThemeId, tokenId] of Object.entries(assignments)) {
        const newThemeId = themeIdMap.get(oldThemeId) || oldThemeId;
        remapped[newThemeId] = tokenIdMap.get(tokenId) || tokenId;
      }
      return remapped;
    };

    // ── Duplicate pages ──
    const newPages: Page[] = projectPages.map((page, i) => ({
      ...page,
      id: pageIdMap.get(page.id)!,
      projectId: newProjectId,
      createdAt: timestamp + i,
    }));

    // ── Duplicate themes ──
    const newThemes: Theme[] = projectThemes.map((theme, index) => ({
      ...theme,
      id: themeIdMap.get(theme.id)!,
      projectId: newProjectId,
      createdAt: timestamp + index,
    }));

    // ── Duplicate groups (remap pageId, paletteNodeId) ──
    const newGroups: TokenGroup[] = projectGroups.map(group => ({
      ...group,
      id: groupIdMap.get(group.id)!,
      projectId: newProjectId,
      pageId: pageIdMap.get(group.pageId) || group.pageId,
      paletteNodeId: group.paletteNodeId ? oldToNewIdMap.get(group.paletteNodeId) || group.paletteNodeId : undefined,
    }));

    // ── Duplicate tokens (remap groupId, pageId, themeValues keys) ──
    const newTokens: DesignToken[] = projectTokens.map((token, index) => ({
      ...token,
      id: tokenIdMap.get(token.id)!,
      projectId: newProjectId,
      pageId: pageIdMap.get(token.pageId) || token.pageId,
      groupId: token.groupId ? groupIdMap.get(token.groupId) || null : null,
      themeValues: remapThemeKeys(token.themeValues),
      themeVisibility: remapThemeKeys(token.themeVisibility) as Record<string, boolean> | undefined,
    }));

    // ── Duplicate nodes (remap ALL cross-references) ──
    const newNodes: ColorNode[] = projectNodes.map(node => ({
      ...node,
      id: oldToNewIdMap.get(node.id)!,
      projectId: newProjectId,
      pageId: pageIdMap.get(node.pageId) || node.pageId,
      parentId: node.parentId ? oldToNewIdMap.get(node.parentId) || null : null,
      // Token assignments (theme → token ID[])
      tokenAssignments: remapTokenAssignments(node.tokenAssignments),
      tokenIds: node.tokenIds ? remapTokenIdArray(node.tokenIds) : node.tokenIds,
      tokenId: node.tokenId ? tokenIdMap.get(node.tokenId) || node.tokenId : node.tokenId,
      // Token node references
      ownTokenId: node.ownTokenId ? tokenIdMap.get(node.ownTokenId) || node.ownTokenId : node.ownTokenId,
      valueTokenId: node.valueTokenId ? tokenIdMap.get(node.valueTokenId) || node.valueTokenId : node.valueTokenId,
      valueTokenAssignments: remapValueTokenAssignments(node.valueTokenAssignments),
      tokenGroupId: node.tokenGroupId ? groupIdMap.get(node.tokenGroupId) || node.tokenGroupId : node.tokenGroupId,
      // Auto-assign references
      autoAssignGroupId: node.autoAssignGroupId ? groupIdMap.get(node.autoAssignGroupId) || node.autoAssignGroupId : node.autoAssignGroupId,
      autoAssignedTokenId: node.autoAssignedTokenId ? tokenIdMap.get(node.autoAssignedTokenId) || node.autoAssignedTokenId : node.autoAssignedTokenId,
      // Theme-specific overrides (remap theme keys)
      themeOverrides: remapThemeKeys(node.themeOverrides) as ColorNode['themeOverrides'],
      themeVisibility: remapThemeKeys(node.themeVisibility) as Record<string, boolean> | undefined,
    }));

    // ── Duplicate canvas states (one per page) ���─
    const projectCanvasStatesAll = canvasStates.filter(cs => cs.projectId === projectId);
    const newCanvasStates: CanvasState[] = projectCanvasStatesAll.length > 0
      ? projectCanvasStatesAll.map(cs => ({
        ...cs,
        projectId: newProjectId,
        pageId: pageIdMap.get(cs.pageId) || cs.pageId,
      }))
      : [{ projectId: newProjectId, pageId: newPages[0]?.id || 'page-1', pan: { x: 0, y: 0 }, zoom: 1 }];

    // ── Duplicate advancedLogic entries (remap nodeId and token refs in expressions) ──
    const projectLogicEntries = advancedLogic.filter(l => oldToNewIdMap.has(l.nodeId));
    const remapExpressionTokens = (exprTokens: ExpressionToken[]): ExpressionToken[] =>
      exprTokens.map(et => ({
        ...et,
        refNodeId: et.refNodeId ? oldToNewIdMap.get(et.refNodeId) || et.refNodeId : et.refNodeId,
        refTokenId: et.refTokenId ? tokenIdMap.get(et.refTokenId) || et.refTokenId : et.refTokenId,
      }));
    const remapConditionRows = (rows: ConditionRow[]): ConditionRow[] =>
      rows.map(row => ({
        ...row,
        id: `${row.id}-dup-${timestamp}`,
        tokens: remapExpressionTokens(row.tokens),
      }));
    const remapChannelDict = (channels: Record<string, ChannelLogic>): Record<string, ChannelLogic> =>
      Object.fromEntries(
        Object.entries(channels).map(([key, ch]) => [key, { ...ch, rows: remapConditionRows(ch.rows) }])
      );
    const remapTokenAssignmentLogic = (ta: TokenAssignmentLogic): TokenAssignmentLogic => ({
      ...ta,
      rows: remapConditionRows(ta.rows),
      fallbackTokenId: ta.fallbackTokenId ? tokenIdMap.get(ta.fallbackTokenId) || ta.fallbackTokenId : ta.fallbackTokenId,
    });
    const newLogicEntries: NodeAdvancedLogic[] = projectLogicEntries.map(entry => ({
      ...entry,
      nodeId: oldToNewIdMap.get(entry.nodeId)!,
      channels: remapChannelDict(entry.channels),
      tokenAssignment: entry.tokenAssignment ? remapTokenAssignmentLogic(entry.tokenAssignment) : entry.tokenAssignment,
      // Duplicate theme-specific overrides with remapped theme keys and expression refs
      themeChannels: entry.themeChannels ? Object.fromEntries(
        Object.entries(entry.themeChannels).map(([tid, ch]) => [themeIdMap.get(tid) || tid, remapChannelDict(ch)])
      ) : undefined,
      themeBaseValues: entry.themeBaseValues ? remapThemeKeys(entry.themeBaseValues) as { [themeId: string]: Record<string, number> } : undefined,
      themeTokenAssignment: entry.themeTokenAssignment ? Object.fromEntries(
        Object.entries(entry.themeTokenAssignment).map(([tid, ta]) => [themeIdMap.get(tid) || tid, remapTokenAssignmentLogic(ta)])
      ) : undefined,
    }));

    setProjects(prev => [...prev, newProject]);
    setPages(prev => [...prev, ...newPages]);
    setAllNodes(prev => [...prev, ...newNodes]);
    setGroups(prev => [...prev, ...newGroups]);
    setTokens(prev => [...prev, ...newTokens]);
    setThemes(prev => [...prev, ...newThemes]);
    setCanvasStates(prev => [...prev, ...newCanvasStates]);
    if (newLogicEntries.length > 0) {
      setAdvancedLogic(prev => [...prev, ...newLogicEntries]);
    }

    // Highlight the duplicated project without switching to it
    setHighlightedProjectId(newProjectId);
    setTimeout(() => setHighlightedProjectId(null), 3000);

    // ── Register with cloud backend (all projects are cloud-backed) ──
    if (authSessionRef.current) {
      registerCloudProject(newProjectId, authSessionRef.current.accessToken).then(result => {
        if (!result.ok) {
          console.log(`☁️ Cloud registration failed for duplicate: ${result.error}`);
          toast.error(`Failed to register project: ${result.error}`);
        }
      });
    }
  }, [projects, allNodes, groups, tokens, themes, canvasStates, pages, advancedLogic]);

  const handleDuplicateSampleProject = useCallback(() => {
    if (!activeProjectId) return;
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj?.isSample) return;

    if (!authSessionRef.current) {
      toast.error('Sign in to create projects');
      return;
    }
    const isAdminUser = authSessionRef.current?.isAdmin;
    const existingCount = projects.filter(p => !p.isTemplate && !p.isSample).length;
    if (!isAdminUser && existingCount >= 20) {
      toast.error('Project limit reached (max 20)');
      return;
    }

    // Call existing duplicateProject (handles all ID remapping)
    duplicateProject(activeProjectId);

    // After duplicate, navigate to the new project
    setTimeout(() => {
      const currentProjects = useStore.getState().projects;
      const newest = currentProjects[currentProjects.length - 1];
      if (newest && newest.name.includes('(Copy)')) {
        // All projects are cloud-backed
        setProjects(prev => prev.map(p => p.id === newest.id ? { ...p, isCloud: true } : p));

        setActiveProjectId(newest.id);
        const newPages = pages.filter(p => p.projectId === newest.id).sort((a, b) => a.createdAt - b.createdAt);
        if (newPages.length > 0) setActivePageId(newPages[0].id);
        const newThemes = themes.filter(t => t.projectId === newest.id).sort((a, b) => a.createdAt - b.createdAt);
        const primaryTheme = newThemes.find(t => t.isPrimary) || newThemes[0];
        if (primaryTheme) setActiveThemeId(primaryTheme.id);
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
        _setViewingProjects(false);
        viewingProjectsRef.current = false;

        const slug = slugify(newest.name || 'untitled');
        navigate(`/project/${slug}`);
        lastSyncedPathnameRef.current = `/project/${slug}`;

        toast.success('Project created');
      }
    }, 100);
  }, [activeProjectId, projects, pages, themes, duplicateProject, navigate]);

  const handleOpenCommunityProject = useCallback((slug: string) => {
    // Reset community loaded ref so the load effect fires for the new slug
    communityLoadedRef.current = false;
    navigate(`/community/${slug}`);
    lastSyncedPathnameRef.current = `/community/${slug}`;
    setIsCommunityMode(true);
    setCommunitySlug(slug);
    _setViewingProjects(false);
    viewingProjectsRef.current = false;
  }, [navigate]);

  const handleRemixCommunityProject = useCallback((slug: string) => {
    // If viewing the project, use the existing sample-project duplication flow
    if (isCommunityMode && activeProjectId?.startsWith('community-')) {
      handleDuplicateSampleProject();
      return;
    }
    // Otherwise, navigate to the project first, then user can remix from there
    handleOpenCommunityProject(slug);
    toast('Open the project and click "Duplicate" to remix it', { duration: 4000 });
  }, [isCommunityMode, activeProjectId, handleDuplicateSampleProject, handleOpenCommunityProject]);

  const handlePublishChange = useCallback((projectId: string, published: boolean, slug?: string) => {
    // Store publish status in localStorage for UI indicators
    try {
      const key = '0colors-published-projects';
      const map = JSON.parse(localStorage.getItem(key) || '{}');
      if (published) {
        map[projectId] = { slug, publishedAt: new Date().toISOString() };
      } else {
        delete map[projectId];
      }
      localStorage.setItem(key, JSON.stringify(map));
    } catch { /* ignore */ }
  }, []);

  const handleSelectProject = useCallback((projectId: string) => {
    // Save current theme's selection before switching projects
    themeSelectionsRef.current[activeThemeIdRef.current] = {
      selectedNodeId: selectedNodeIdRef.current,
      selectedNodeIds: [...selectedNodeIdsRef.current],
    };

    // ── Clean up community project data when switching away ──
    if (activeProjectId?.startsWith('community-') && !projectId.startsWith('community-')) {
      setAllNodes(prev => prev.filter(n => !n.projectId.startsWith('community-')));
      setTokens(prev => prev.filter(t => !t.projectId.startsWith('community-')));
      setGroups(prev => prev.filter(g => !g.projectId.startsWith('community-')));
      setPages(prev => prev.filter(p => !p.projectId.startsWith('community-')));
      setThemes(prev => prev.filter(t => !t.projectId.startsWith('community-')));
      setCanvasStates(prev => prev.filter(cs => !cs.projectId.startsWith('community-')));
      setProjects(prev => prev.filter(p => !p.id.startsWith('community-')));
      setIsCommunityMode(false);
      setCommunitySlug(null);
      (window as any).__communityProjectMeta = null;
    }

    // ── CRITICAL: Flush dirty projects to cloud before switching ──
    // Prevents data loss when the user switches between projects.
    // Write-through handles sync — flush any pending debounced syncs
    import('../sync/write-through').then(m => m.forceSyncAll().catch(() => {}));

    setActiveProjectId(projectId);

    // ── Session lock: acquire lock for all non-sample projects ──
    const projectForLock = projects.find(p => p.id === projectId);
    if (!projectForLock?.isSample) {
      lockManager.setActiveProject(projectId, true);
    } else {
      lockManager.setActiveProject(null, false);
    }

    // Switch to the first page of the selected project
    const projectPages = pages.filter(p => p.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
    if (projectPages.length > 0) {
      setActivePageId(projectPages[0].id);
    }

    // Switch to the primary theme of the selected project
    const projectThemes = themes.filter(t => t.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
    const primaryTheme = projectThemes.find(t => t.isPrimary) || projectThemes[0];
    if (primaryTheme) {
      // Restore selection for the target project's theme, or clear
      const savedSelection = themeSelectionsRef.current[primaryTheme.id];
      if (savedSelection) {
        setSelectedNodeId(savedSelection.selectedNodeId);
        setSelectedNodeIds(savedSelection.selectedNodeIds);
      } else {
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
      }
      setActiveThemeId(primaryTheme.id);
    } else {
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
    }

    _setViewingProjects(false);
    viewingProjectsRef.current = false;

    // If opening a sample project, center the canvas on its nodes after render
    const project = projects.find(p => p.id === projectId);
    if (project?.isSample) {
      setTimeout(() => {
        window.dispatchEvent(new Event('canvasFitAll'));
      }, 200);
    }

    // ── Push project URL ──
    const projectForSlug = projects.find(p => p.id === projectId);
    if (projectId.startsWith('community-')) {
      // Community projects use /community/<slug> URL pattern
      const cSlug = (window as any).__communityProjectMeta?.slug || slugify(projectForSlug?.name || 'untitled');
      navigate(`/community/${cSlug}`);
      lastSyncedPathnameRef.current = `/community/${cSlug}`;
    } else if (projectForSlug?.isSample) {
      // Sample projects use /sample-project/<template-name> URL pattern
      const activeTemplate = sampleTemplates.find(t => t.id === activeSampleTemplateId);
      const templateSlug = slugify(activeTemplate?.name || projectForSlug.name || 'untitled');
      navigate(`/sample-project/${templateSlug}`);
      lastSyncedPathnameRef.current = `/sample-project/${templateSlug}`;
    } else {
      const slug = slugify(projectForSlug?.name || 'untitled');
      navigate(`/project/${slug}`);
      lastSyncedPathnameRef.current = `/project/${slug}`;
    }
  }, [pages, themes, projects, navigate, sampleTemplates, activeSampleTemplateId]);

  const handleCreateProject = useCallback((type: 'cloud' | 'template' = 'cloud') => {
    const created = addProject(type);
    if (!created) return;
    _setViewingProjects(false);
    viewingProjectsRef.current = false;
    // Navigate after a tick so the new project is in state
    setTimeout(() => {
      const latestProjects = useStore.getState().projects;
      const latest = latestProjects[latestProjects.length - 1];
      if (latest) {
        const slug = slugify(latest.name || 'untitled');
        navigate(`/project/${slug}`);
        lastSyncedPathnameRef.current = `/project/${slug}`;
      }
    }, 0);
  }, [addProject, navigate]);

  const handleBackToProjects = useCallback(() => {
    // ── CRITICAL: Flush dirty cloud projects to server before leaving the project ──
    // This ensures the user's local changes are uploaded to cloud immediately
    // when they navigate away, preventing data loss on subsequent reconcile.
    // Write-through handles sync — flush any pending debounced syncs
    import('../sync/write-through').then(m => m.forceSyncAll().catch(() => {}));

    // If viewing a community project, go back to community section in dashboard
    if (isCommunityMode || activeProjectId?.startsWith('community-')) {
      // Clean up community project data
      setAllNodes(prev => prev.filter(n => !n.projectId.startsWith('community-')));
      setTokens(prev => prev.filter(t => !t.projectId.startsWith('community-')));
      setGroups(prev => prev.filter(g => !g.projectId.startsWith('community-')));
      setPages(prev => prev.filter(p => !p.projectId.startsWith('community-')));
      setThemes(prev => prev.filter(t => !t.projectId.startsWith('community-')));
      setCanvasStates(prev => prev.filter(cs => !cs.projectId.startsWith('community-')));
      setProjects(prev => prev.filter(p => !p.id.startsWith('community-')));
      setIsCommunityMode(false);
      setCommunitySlug(null);
      communityLoadedRef.current = false;
      (window as any).__communityProjectMeta = null;
      setDashboardSection('community');
      _setViewingProjects(true);
      viewingProjectsRef.current = true;
      navigate('/community');
      lastSyncedPathnameRef.current = '/community';
      return;
    }

    setDashboardSection('projects');
    _setViewingProjects(true);
    viewingProjectsRef.current = true;
    _setViewMode('canvas');
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    navigate('/projects');
    lastSyncedPathnameRef.current = '/projects';
  }, [navigate, isCommunityMode, activeProjectId]);

  const publishedProjectsMap = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('0colors-published-projects') || '{}') as Record<string, { slug: string; publishedAt: string }>;
    } catch { return {}; }
  }, [showPublishPopup]); // re-derive after publish popup closes

  const publishedProjectIds = useMemo(() => new Set(Object.keys(publishedProjectsMap)), [publishedProjectsMap]);



  return {
    addProject, deleteProject, duplicateProject,
    handleDuplicateSampleProject, handleOpenCommunityProject, handleRemixCommunityProject,
    handlePublishChange, publishedProjectsMap, publishedProjectIds,
    handleSelectProject, handleCreateProject, handleBackToProjects,
  };
}
