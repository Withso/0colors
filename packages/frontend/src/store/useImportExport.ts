// Import/Export operation callbacks extracted from App.tsx
import { useCallback } from 'react';
import type { ColorNode, DesignToken, TokenProject, TokenGroup, CanvasState, Page, Theme, NodeAdvancedLogic } from '../types';
import { migrateToLatest, CURRENT_SCHEMA_VERSION } from '../utils/migrations';
import { useStore } from './index';
import { useReadOnlyState } from '../hooks/useReadOnlyState';
import { toast } from 'sonner';

interface UseImportExportParams {
  authSessionRef: React.MutableRefObject<{ accessToken: string; userId: string; email: string; name: string } | null>;
}

export function useImportExport({
  authSessionRef,
}: UseImportExportParams) {
  // ── Read entity state + setters from Zustand store ──
  const allNodes = useStore(s => s.allNodes);
  const tokens = useStore(s => s.tokens);
  const groups = useStore(s => s.groups);
  const projects = useStore(s => s.projects);
  const pages = useStore(s => s.pages);
  const themes = useStore(s => s.themes);
  const canvasStates = useStore(s => s.canvasStates);
  const advancedLogic = useStore(s => s.advancedLogic);
  const activeProjectId = useStore(s => s.activeProjectId);

  const setAllNodes = useStore(s => s.setAllNodes);
  const setTokens = useStore(s => s.setTokens);
  const setGroups = useStore(s => s.setGroups);
  const setProjects = useStore(s => s.setProjects);
  const setPages = useStore(s => s.setPages);
  const setThemes = useStore(s => s.setThemes);
  const setCanvasStates = useStore(s => s.setCanvasStates);
  const setAdvancedLogic = useStore(s => s.setAdvancedLogic);
  const setActiveProjectId = useStore(s => s.setActiveProjectId);

  // ── UI state + setters from Zustand store ──
  const setHighlightedProjectId = useStore(s => s.setHighlightedProjectId);
  const setIsImporting = useStore(s => s.setIsImporting);
  const flushUndo = useStore(s => s.flushUndo);

  // ── Local sample-mode guard (reads from store) ──
  const { isSampleMode } = useReadOnlyState();
  const sampleModeToast = useCallback((action?: string) => {
    toast('Duplicate this project to make changes', {
      description: action ? `${action} is not available in sample mode` : undefined,
      duration: 3000,
    });
  }, []);

  const exportJSON = useCallback(() => {
    const exportData = {
      nodes: allNodes,
      tokens,
      groups,
      projects,
      canvasStates,
      activeProjectId,
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'color-tool-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [allNodes, tokens, groups, projects, canvasStates, activeProjectId]);

  const importJSON = useCallback(() => {
    if (isSampleMode) { sampleModeToast('Importing'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = JSON.parse(event.target?.result as string);

            if (imported.nodes && (imported.projects || imported.collections)) {
              flushUndo(); // commit any pending undo batch so the import becomes its own entry
              setIsImporting(true);

              const nodesToImport = imported.nodes || [];
              const tokensToImport = imported.tokens || [];
              const groupsToImport = imported.groups || [];
              const projectsToImport = imported.projects || imported.collections || [];
              const canvasStatesToImport = imported.canvasStates || [];
              const activeProjectToImport = imported.activeProjectId || imported.activeCollectionId || projectsToImport[0]?.id || 'sample-project';

              // Migration: convert old tokenId to tokenIds array and add colorSpace
              const migratedNodes = nodesToImport.map((node: any) => {
                let migrated = { ...node };

                // Migration 1: tokenId -> tokenIds
                if (node.tokenId !== undefined && node.tokenIds === undefined) {
                  const { tokenId, ...rest } = migrated;
                  migrated = {
                    ...rest,
                    tokenIds: tokenId ? [tokenId] : [],
                  };
                }

                // Migration 2: add colorSpace
                if (!migrated.colorSpace) {
                  migrated.colorSpace = 'hsl';
                }

                return migrated;
              });

              setAllNodes(migratedNodes);
              setTokens(tokensToImport);
              setGroups(groupsToImport);
              setProjects(projectsToImport);
              setCanvasStates(canvasStatesToImport);
              setActiveProjectId(activeProjectToImport);

              setTimeout(() => {
                setIsImporting(false);
              }, 500);
            } else if (Array.isArray(imported)) {
              const migratedNodes = imported.map((node: any) => ({
                ...node,
                colorSpace: node.colorSpace || 'hsl',
                tokenIds: node.tokenId ? [node.tokenId] : (node.tokenIds || []),
                projectId: node.projectId ?? node.collectionId ?? activeProjectId,
              }));
              setAllNodes(prev => [...prev.filter(n => n.projectId !== activeProjectId), ...migratedNodes]);
            }
          } catch (error) {
            console.error('Failed to import:', error);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [activeProjectId, flushUndo, isSampleMode, sampleModeToast]);

  const cleanupOrphanedData = useCallback(() => {
    console.log('🧹 Manual cleanup triggered...');

    // Find orphaned palette groups (no corresponding palette node)
    const paletteEntryGroups = groups.filter(g => g.isPaletteEntry);
    const orphanedGroupIds: string[] = [];

    paletteEntryGroups.forEach(group => {
      if (!group.paletteNodeId) {
        orphanedGroupIds.push(group.id);
        return;
      }
      const paletteNodeExists = allNodes.some(n => n.id === group.paletteNodeId && n.isPalette);
      if (!paletteNodeExists) {
        orphanedGroupIds.push(group.id);
      }
    });

    // Find orphaned tokens (tokens whose groupId doesn't exist)
    const validGroupIds = new Set(groups.filter(g => !orphanedGroupIds.includes(g.id)).map(g => g.id));
    const orphanedTokenIds = tokens.filter(t => t.groupId && !validGroupIds.has(t.groupId)).map(t => t.id);

    if (orphanedGroupIds.length > 0 || orphanedTokenIds.length > 0) {
      console.log(`🗑️ Removing ${orphanedGroupIds.length} groups and ${orphanedTokenIds.length} tokens`);

      setGroups(prev => prev.filter(g => !orphanedGroupIds.includes(g.id)));
      setTokens(prev => prev.filter(t => !orphanedGroupIds.includes(t.groupId || '') && !orphanedTokenIds.includes(t.id)));

      console.log('✅ Cleanup complete');
    } else {
      console.log('✅ No orphaned data found');
    }
  }, [allNodes, groups, tokens]);

  const exportProjectJSON = useCallback((projectId: string) => {
    const project = projects.find(c => c.id === projectId);
    if (!project) {
      return;
    }

    const projectNodes = allNodes.filter(n => n.projectId === projectId);
    const projectTokens = tokens.filter(t => t.projectId === projectId);
    const projectGroups = groups.filter(g => g.projectId === projectId);
    const projectCanvasState = canvasStates.find(cs => cs.projectId === projectId);
    const projectPages = pages.filter(p => p.projectId === projectId);
    const projectThemes = themes.filter(t => t.projectId === projectId);
    const projectNodeIds = new Set(projectNodes.map(n => n.id));
    const projectLogic = advancedLogic.filter(l => projectNodeIds.has(l.nodeId));

    const exportData = {
      project,
      nodes: projectNodes,
      tokens: projectTokens,
      groups: projectGroups,
      canvasState: projectCanvasState,
      pages: projectPages,
      themes: projectThemes,
      advancedLogic: projectLogic,
      schemaVersion: CURRENT_SCHEMA_VERSION, // Stamp version for migration system
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '-').toLowerCase()}-project.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allNodes, tokens, groups, projects, canvasStates, pages, themes, advancedLogic]);

  const importProjectJSON = useCallback(() => {
    if (isSampleMode) { sampleModeToast('Importing'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const fileContent = event.target?.result as string;
            console.log('📦 File loaded, size:', fileContent?.length, 'characters');

            if (!fileContent || fileContent.trim() === '') {
              alert('Error: The file is empty.');
              return;
            }

            let imported;
            try {
              imported = JSON.parse(fileContent);
            } catch (parseError) {
              console.error('❌ JSON parse error:', parseError);
              alert('Error: The file is not valid JSON.\n\n' + parseError);
              return;
            }

            console.log('📦 RAW JSON:', fileContent.substring(0, 500));
            console.log('📦 Imported data:', imported);
            console.log('📦 Type:', typeof imported);
            console.log('📦 Keys:', imported && typeof imported === 'object' ? Object.keys(imported) : 'N/A');
            console.log('📦 Has project?', !!imported?.project);
            console.log('📦 Has collection?', !!imported?.collection);
            console.log('📦 Has nodes?', Array.isArray(imported?.nodes), '- Count:', imported?.nodes?.length);
            console.log('📦 Has tokens?', Array.isArray(imported?.tokens), '- Count:', imported?.tokens?.length);
            console.log('📦 Has groups?', Array.isArray(imported?.groups), '- Count:', imported?.groups?.length);

            // Validate structure - be more lenient for debugging
            const hasProject = imported?.project || imported?.collection;
            const hasNodes = Array.isArray(imported?.nodes);
            const hasTokens = Array.isArray(imported?.tokens);
            const hasRequiredArrays = hasNodes && hasTokens;

            console.log('🔍 Validation:', { hasProject, hasNodes, hasTokens, hasRequiredArrays });

            if (hasProject && hasRequiredArrays) {
              // ── Run schema migrations on imported data ──
              const importMigration = migrateToLatest({
                nodes: imported.nodes || [],
                tokens: imported.tokens || [],
                groups: imported.groups || [],
                pages: imported.pages || [],
                themes: imported.themes || [],
                schemaVersion: imported.schemaVersion,
              });
              if (importMigration.migrated) {
                console.log(`🔄 Import migration: ${importMigration.appliedMigrations.join(', ')}`);
                imported.nodes = importMigration.data.nodes;
                imported.tokens = importMigration.data.tokens;
                imported.groups = importMigration.data.groups;
                imported.pages = importMigration.data.pages;
                imported.themes = importMigration.data.themes;
              }

              const timestamp = Date.now();
              const newProjectId = `project-${timestamp}`;
              const importedProject = imported.project || imported.collection;
              const newProject: TokenProject = {
                id: newProjectId,
                name: (importedProject.name || 'Untitled Project') + ' (Imported)',
                isExpanded: true,
                isSample: false,
                folderColor: importedProject.folderColor ?? Math.floor(Math.random() * 360),
              };

              console.log('Creating new project:', newProject);

              // ── Build ALL ID remapping tables ──
              const nodeIdMap = new Map<string, string>();
              const groupIdMap = new Map<string, string>();
              const tokenIdMap = new Map<string, string>();
              const pageIdMap = new Map<string, string>();
              const themeIdMap = new Map<string, string>();

              // Pre-register node IDs first (two-pass for forward references)
              (imported.nodes || []).forEach((node: any, i: number) => {
                nodeIdMap.set(node.id, `node-${timestamp}-${i}`);
              });
              (imported.groups || []).forEach((group: any, i: number) => {
                groupIdMap.set(group.id, `group-${timestamp}-${i}`);
              });
              (imported.tokens || []).forEach((token: any, i: number) => {
                tokenIdMap.set(token.id, `token-${timestamp}-${i}`);
              });

              // ── Pages: import from file or create a default ──
              const importedPages = Array.isArray(imported.pages) ? imported.pages : [];
              let newPages: Page[];
              if (importedPages.length > 0) {
                importedPages.forEach((page: any, i: number) => {
                  pageIdMap.set(page.id, `page-${timestamp}-p${i}`);
                });
                newPages = importedPages.map((page: any) => ({
                  ...page,
                  id: pageIdMap.get(page.id)!,
                  projectId: newProjectId,
                }));
              } else {
                const defaultPageId = `page-${timestamp}`;
                // Map all old pageIds found on nodes to this one default page
                const uniquePageIds = new Set<string>();
                (imported.nodes || []).forEach((n: any) => { if (n.pageId) uniquePageIds.add(n.pageId); });
                (imported.groups || []).forEach((g: any) => { if (g.pageId) uniquePageIds.add(g.pageId); });
                (imported.tokens || []).forEach((t: any) => { if (t.pageId) uniquePageIds.add(t.pageId); });
                uniquePageIds.forEach(pid => pageIdMap.set(pid, defaultPageId));
                newPages = [{ id: defaultPageId, name: 'Page 1', projectId: newProjectId, createdAt: timestamp }];
              }

              // ── Themes: import from file or create a default ──
              const importedThemes = Array.isArray(imported.themes) ? imported.themes : [];
              let newThemes: Theme[];
              if (importedThemes.length > 0) {
                importedThemes.forEach((theme: any, i: number) => {
                  themeIdMap.set(theme.id, `theme-${timestamp}-t${i}`);
                });
                newThemes = importedThemes.map((theme: any) => ({
                  ...theme,
                  id: themeIdMap.get(theme.id)!,
                  projectId: newProjectId,
                }));
              } else {
                const defaultThemeId = `theme-${timestamp}`;
                // Map all old themeIds found in data to default theme
                const uniqueThemeIds = new Set<string>();
                (imported.nodes || []).forEach((n: any) => {
                  if (n.themeOverrides) Object.keys(n.themeOverrides).forEach(k => uniqueThemeIds.add(k));
                  if (n.tokenAssignments) Object.keys(n.tokenAssignments).forEach(k => uniqueThemeIds.add(k));
                  if (n.valueTokenAssignments) Object.keys(n.valueTokenAssignments).forEach(k => uniqueThemeIds.add(k));
                });
                (imported.tokens || []).forEach((t: any) => {
                  if (t.themeValues) Object.keys(t.themeValues).forEach(k => uniqueThemeIds.add(k));
                });
                uniqueThemeIds.forEach(tid => themeIdMap.set(tid, defaultThemeId));
                newThemes = [{ id: defaultThemeId, name: 'Default', projectId: newProjectId, createdAt: timestamp, isPrimary: true }];
              }

              // ── Helper: remap theme-keyed dicts ──
              const remapThemeKeys = <T,>(dict: Record<string, T> | undefined): Record<string, T> | undefined => {
                if (!dict) return dict;
                const remapped: Record<string, T> = {};
                for (const [oldId, val] of Object.entries(dict)) {
                  remapped[themeIdMap.get(oldId) || oldId] = val;
                }
                return remapped;
              };

              const newGroups = (imported.groups || []).map((group: any) => ({
                ...group,
                id: groupIdMap.get(group.id)!,
                projectId: newProjectId,
                pageId: pageIdMap.get(group.pageId) || newPages[0].id,
                paletteNodeId: group.paletteNodeId ? nodeIdMap.get(group.paletteNodeId) || group.paletteNodeId : undefined,
              }));

              const newTokens = (imported.tokens || []).map((token: any) => ({
                ...token,
                id: tokenIdMap.get(token.id)!,
                projectId: newProjectId,
                pageId: pageIdMap.get(token.pageId) || newPages[0].id,
                groupId: token.groupId ? groupIdMap.get(token.groupId) || null : null,
                themeValues: remapThemeKeys(token.themeValues),
                themeVisibility: remapThemeKeys(token.themeVisibility),
              }));

              // ── Helper: remap token assignment objects ──
              const remapTokenAssignments = (assignments: any): any => {
                if (!assignments) return assignments;
                const remapped: any = {};
                for (const [oldThemeId, tokenIds] of Object.entries(assignments)) {
                  const newThemeId = themeIdMap.get(oldThemeId) || oldThemeId;
                  remapped[newThemeId] = Array.isArray(tokenIds)
                    ? (tokenIds as string[]).map(tid => tokenIdMap.get(tid) || tid)
                    : tokenIdMap.get(tokenIds as string) || tokenIds;
                }
                return remapped;
              };

              const newNodes = (imported.nodes || []).map((node: any) => {
                const tokenIds = node.tokenId
                  ? [tokenIdMap.get(node.tokenId) || node.tokenId]
                  : (node.tokenIds || []).map((tid: string) => tokenIdMap.get(tid) || tid);

                return {
                  ...node,
                  colorSpace: node.colorSpace || 'hsl',
                  id: nodeIdMap.get(node.id)!,
                  projectId: newProjectId,
                  pageId: pageIdMap.get(node.pageId) || newPages[0].id,
                  parentId: node.parentId ? nodeIdMap.get(node.parentId) || null : null,
                  tokenIds,
                  tokenId: node.tokenId ? tokenIdMap.get(node.tokenId) || node.tokenId : node.tokenId,
                  tokenAssignments: remapTokenAssignments(node.tokenAssignments),
                  ownTokenId: node.ownTokenId ? tokenIdMap.get(node.ownTokenId) || node.ownTokenId : node.ownTokenId,
                  valueTokenId: node.valueTokenId ? tokenIdMap.get(node.valueTokenId) || node.valueTokenId : node.valueTokenId,
                  valueTokenAssignments: node.valueTokenAssignments ? remapTokenAssignments(node.valueTokenAssignments) : undefined,
                  tokenGroupId: node.tokenGroupId ? groupIdMap.get(node.tokenGroupId) || node.tokenGroupId : node.tokenGroupId,
                  autoAssignGroupId: node.autoAssignGroupId ? groupIdMap.get(node.autoAssignGroupId) || node.autoAssignGroupId : node.autoAssignGroupId,
                  autoAssignedTokenId: node.autoAssignedTokenId ? tokenIdMap.get(node.autoAssignedTokenId) || node.autoAssignedTokenId : node.autoAssignedTokenId,
                  themeOverrides: remapThemeKeys(node.themeOverrides),
                  themeVisibility: remapThemeKeys(node.themeVisibility),
                };
              });

              // ── Canvas states ──
              const newCanvasStates: CanvasState[] = [];
              if (imported.canvasState) {
                newCanvasStates.push({
                  ...imported.canvasState,
                  projectId: newProjectId,
                  pageId: pageIdMap.get(imported.canvasState.pageId) || newPages[0].id,
                });
              } else {
                newPages.forEach(p => {
                  newCanvasStates.push({ projectId: newProjectId, pageId: p.id, pan: { x: 0, y: 0 }, zoom: 1 });
                });
              }

              // ── Advanced logic ──
              const importedLogic: NodeAdvancedLogic[] = Array.isArray(imported.advancedLogic) ? imported.advancedLogic : [];
              const newLogicEntries: NodeAdvancedLogic[] = importedLogic
                .filter((l: any) => nodeIdMap.has(l.nodeId))
                .map((entry: any) => ({
                  ...entry,
                  nodeId: nodeIdMap.get(entry.nodeId)!,
                  channels: Object.fromEntries(
                    Object.entries(entry.channels || {}).map(([key, ch]: [string, any]) => [key, {
                      ...ch,
                      rows: (ch.rows || []).map((row: any) => ({
                        ...row,
                        id: `${row.id}-imp-${timestamp}`,
                        tokens: (row.tokens || []).map((et: any) => ({
                          ...et,
                          refNodeId: et.refNodeId ? nodeIdMap.get(et.refNodeId) || et.refNodeId : et.refNodeId,
                          refTokenId: et.refTokenId ? tokenIdMap.get(et.refTokenId) || et.refTokenId : et.refTokenId,
                        })),
                      })),
                    }])
                  ),
                  tokenAssignment: entry.tokenAssignment ? {
                    ...entry.tokenAssignment,
                    rows: (entry.tokenAssignment.rows || []).map((row: any) => ({
                      ...row,
                      id: `${row.id}-imp-${timestamp}`,
                      tokens: (row.tokens || []).map((et: any) => ({
                        ...et,
                        refNodeId: et.refNodeId ? nodeIdMap.get(et.refNodeId) || et.refNodeId : et.refNodeId,
                        refTokenId: et.refTokenId ? tokenIdMap.get(et.refTokenId) || et.refTokenId : et.refTokenId,
                      })),
                    })),
                    fallbackTokenId: entry.tokenAssignment.fallbackTokenId
                      ? tokenIdMap.get(entry.tokenAssignment.fallbackTokenId) || entry.tokenAssignment.fallbackTokenId
                      : entry.tokenAssignment.fallbackTokenId,
                  } : entry.tokenAssignment,
                  // Theme-specific overrides: remap theme keys and expression refs
                  themeChannels: entry.themeChannels ? Object.fromEntries(
                    Object.entries(entry.themeChannels).map(([tid, channels]: [string, any]) => [
                      themeIdMap.get(tid) || tid,
                      Object.fromEntries(
                        Object.entries(channels || {}).map(([key, ch]: [string, any]) => [key, {
                          ...ch,
                          rows: (ch.rows || []).map((row: any) => ({
                            ...row,
                            id: `${row.id}-imp-${timestamp}`,
                            tokens: (row.tokens || []).map((et: any) => ({
                              ...et,
                              refNodeId: et.refNodeId ? nodeIdMap.get(et.refNodeId) || et.refNodeId : et.refNodeId,
                              refTokenId: et.refTokenId ? tokenIdMap.get(et.refTokenId) || et.refTokenId : et.refTokenId,
                            })),
                          })),
                        }])
                      ),
                    ])
                  ) : undefined,
                  themeBaseValues: entry.themeBaseValues ? remapThemeKeys(entry.themeBaseValues) : undefined,
                  themeTokenAssignment: entry.themeTokenAssignment ? Object.fromEntries(
                    Object.entries(entry.themeTokenAssignment).map(([tid, ta]: [string, any]) => [
                      themeIdMap.get(tid) || tid,
                      {
                        ...ta,
                        rows: (ta.rows || []).map((row: any) => ({
                          ...row,
                          id: `${row.id}-imp-${timestamp}`,
                          tokens: (row.tokens || []).map((et: any) => ({
                            ...et,
                            refNodeId: et.refNodeId ? nodeIdMap.get(et.refNodeId) || et.refNodeId : et.refNodeId,
                            refTokenId: et.refTokenId ? tokenIdMap.get(et.refTokenId) || et.refTokenId : et.refTokenId,
                          })),
                        })),
                        fallbackTokenId: ta.fallbackTokenId
                          ? tokenIdMap.get(ta.fallbackTokenId) || ta.fallbackTokenId
                          : ta.fallbackTokenId,
                      },
                    ])
                  ) : undefined,
                }));

              setProjects(prev => {
                console.log('Adding project to list. Current projects:', prev.length);
                const updated = [...prev, newProject];
                console.log('New projects count:', updated.length);
                return updated;
              });
              setPages(prev => [...prev, ...newPages]);
              setThemes(prev => [...prev, ...newThemes]);
              setGroups(prev => [...prev, ...newGroups]);
              setTokens(prev => [...prev, ...newTokens]);
              setAllNodes(prev => [...prev, ...newNodes]);
              setCanvasStates(prev => [...prev, ...newCanvasStates]);
              if (newLogicEntries.length > 0) {
                setAdvancedLogic(prev => [...prev, ...newLogicEntries]);
              }

              console.log('✅ Project imported successfully:', newProject.name);

              // Highlight the imported project without switching to it
              setHighlightedProjectId(newProjectId);
              setTimeout(() => setHighlightedProjectId(null), 3000);
            } else {
              console.error('❌ Invalid JSON structure. Expected project/collection, nodes, and tokens.');
              const receivedKeys = imported && typeof imported === 'object' ? Object.keys(imported) : [];
              console.log('❌ Received keys:', receivedKeys);
              console.log('❌ Validation failed:');
              console.log('  - Has project/collection?', hasProject);
              console.log('  - Has nodes array?', hasNodes);
              console.log('  - Has tokens array?', hasTokens);

              let errorMsg = 'Invalid project file format.\n\n';
              if (!hasProject) errorMsg += '• Missing "project" object\n';
              if (!Array.isArray(imported.nodes)) errorMsg += '• Missing or invalid "nodes" array\n';
              if (!Array.isArray(imported.tokens)) errorMsg += '• Missing or invalid "tokens" array\n';

              alert(errorMsg + '\nPlease make sure you\'re importing a valid project export.');
            }
          } catch (error) {
            console.error('❌ Failed to import project:', error);
            alert('Error importing project: ' + (error instanceof Error ? error.message : String(error)));
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [isSampleMode, sampleModeToast]);


  return {
    exportJSON, importJSON, cleanupOrphanedData,
    exportProjectJSON, importProjectJSON,
  };
}
