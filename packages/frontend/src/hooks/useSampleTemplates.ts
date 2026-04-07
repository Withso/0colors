/**
 * useSampleTemplates — extracted from App.tsx
 *
 * Owns sample template logic:
 *   - reconstructAutoAssignedTokens helper
 *   - sampleTemplates, filteredSampleTemplates, activeSampleIdx memos
 *   - sampleModeToast callback
 *   - handleSwitchSampleTemplate callback
 *   - auto-switch cloud templates useEffect
 *   - isSampleMode / isSampleModeRef
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { useNavigate } from 'react-router';
import { getBuiltInTemplates, type SampleTemplate } from '../utils/sample-templates';
import { getAutoAssignSuffixValue } from '../components/canvas/AutoAssignTokenMenu';
import { slugify } from '../utils/slugify';
import { toast } from 'sonner';

/**
 * Reconstruct missing auto-assigned tokens from node metadata.
 * When a server snapshot omits `tokens`, we can recreate them from the parent's
 * auto-assign config and each child's color values + `autoAssignedTokenId`.
 */
function reconstructAutoAssignedTokens(
  nodes: any[],
  tokens: any[],
  groups: any[],
  themes: any[],
  projectId: string,
): { tokens: any[]; groups: any[]; nodes: any[] } {
  const existingTokenIds = new Set(tokens.map((t: any) => t.id));
  const existingGroupIds = new Set(groups.map((g: any) => g.id));
  const newTokens: any[] = [];
  const newGroups: any[] = [];
  // Track nodes needing tokenAssignments patching
  const nodePatches = new Map<string, any>();

  // Find all auto-assign parent nodes
  const autoParents = nodes.filter((n: any) => n.autoAssignEnabled);

  for (const parent of autoParents) {
    const prefix = parent.autoAssignPrefix || parent.referenceName || 'color';
    const suffixPattern = parent.autoAssignSuffix || '1-9';
    const startFrom = parent.autoAssignStartFrom;
    const targetGroupId = parent.autoAssignGroupId || null;

    // Ensure the target group exists
    if (targetGroupId && !existingGroupIds.has(targetGroupId)) {
      newGroups.push({
        id: targetGroupId,
        name: prefix,
        projectId,
        pageId: parent.pageId,
        isAutoAssignCreated: true,
      });
      existingGroupIds.add(targetGroupId);
    }

    // Get direct children (same parentId), sorted by ID (creation order)
    const children = nodes
      .filter((n: any) => n.parentId === parent.id && !n.isSpacing)
      .sort((a: any, b: any) => a.id.localeCompare(b.id));

    let assignIndex = 0;
    for (const child of children) {
      if (child.autoAssignExcluded) continue;

      const suffixValue = getAutoAssignSuffixValue(suffixPattern as any, assignIndex, startFrom);
      const tokenName = `${prefix}-${suffixValue}`;
      assignIndex++;

      const tokenId = child.autoAssignedTokenId;
      if (!tokenId || existingTokenIds.has(tokenId)) continue;

      // Reconstruct the token from the child node's color values
      const themeValues: any = {};
      for (const theme of themes) {
        const themeOverride = child.themeOverrides?.[theme.id];
        const h = themeOverride?.hue !== undefined ? themeOverride.hue : child.hue;
        const s = themeOverride?.saturation !== undefined ? themeOverride.saturation : child.saturation;
        const l = themeOverride?.lightness !== undefined ? themeOverride.lightness : child.lightness;
        const a = themeOverride?.alpha !== undefined ? themeOverride.alpha : (child.alpha ?? 100);
        themeValues[theme.id] = { hue: h, saturation: s, lightness: l, alpha: a };
      }

      newTokens.push({
        id: tokenId,
        name: tokenName,
        type: 'color',
        groupId: targetGroupId,
        projectId,
        pageId: parent.pageId || child.pageId,
        themeValues,
        hue: child.hue,
        saturation: child.saturation,
        lightness: child.lightness,
        alpha: child.alpha ?? 100,
        createdAt: Date.now(),
      });
      existingTokenIds.add(tokenId);

      // Ensure the child node's tokenAssignments include this token for all themes
      const existingAssignments = child.tokenAssignments || {};
      const patchedAssignments = { ...existingAssignments };
      let needsPatch = false;
      for (const theme of themes) {
        const themeTokens = patchedAssignments[theme.id] || [];
        if (!themeTokens.includes(tokenId)) {
          patchedAssignments[theme.id] = [...themeTokens, tokenId];
          needsPatch = true;
        }
      }
      if (needsPatch) {
        nodePatches.set(child.id, { tokenAssignments: patchedAssignments });
      }
    }
  }

  // Apply node patches
  const patchedNodes = nodePatches.size > 0
    ? nodes.map((n: any) => {
      const patch = nodePatches.get(n.id);
      return patch ? { ...n, ...patch } : n;
    })
    : nodes;

  if (newTokens.length > 0) {
    console.log(`🔧 Reconstructed ${newTokens.length} auto-assigned token(s) from node metadata`);
    if (newGroups.length > 0) {
      console.log(`🔧 Reconstructed ${newGroups.length} auto-assign group(s)`);
    }
  }

  return {
    tokens: [...tokens, ...newTokens],
    groups: [...groups, ...newGroups],
    nodes: patchedNodes,
  };
}

export { reconstructAutoAssignedTokens };

export function useSampleTemplates(lastSyncedPathnameRef: React.MutableRefObject<string>) {
  const navigate = useNavigate();

  // ── Store selectors ──
  const activeSampleTemplateId = useStore(s => s.activeSampleTemplateId);
  const setActiveSampleTemplateId = useStore(s => s.setActiveSampleTemplateId);
  const sampleTemplateSearch = useStore(s => s.sampleTemplateSearch);
  const setSampleTemplateSearch = useStore(s => s.setSampleTemplateSearch);
  const cloudTemplates = useStore(s => s.cloudTemplates);
  const cloudTemplatesLoaded = useStore(s => s.cloudTemplatesLoaded);
  const setAllNodes = useStore(s => s.setAllNodes);
  const setTokens = useStore(s => s.setTokens);
  const setGroups = useStore(s => s.setGroups);
  const setPages = useStore(s => s.setPages);
  const setThemes = useStore(s => s.setThemes);
  const setCanvasStates = useStore(s => s.setCanvasStates);
  const setProjects = useStore(s => s.setProjects);
  const projects = useStore(s => s.projects);
  const activeProjectId = useStore(s => s.activeProjectId);
  const setActivePageId = useStore(s => s.setActivePageId);
  const setActiveThemeId = useStore(s => s.setActiveThemeId);
  const setSelectedNodeId = useStore(s => s.setSelectedNodeId);
  const setSelectedNodeIds = useStore(s => s.setSelectedNodeIds);

  // ── Sample mode: derived from active project's isSample flag ──
  const isSampleMode = projects.find(p => p.id === activeProjectId)?.isSample === true;
  const isSampleModeRef = useRef(isSampleMode);
  isSampleModeRef.current = isSampleMode;

  // Debounced toast for sample-mode blocked actions (prevents toast spam)
  const lastSampleToastRef = useRef(0);
  const sampleModeToast = useCallback((action?: string) => {
    const now = Date.now();
    if (now - lastSampleToastRef.current < 2500) return;
    lastSampleToastRef.current = now;
    toast('Duplicate this project to make changes', {
      description: action ? `${action} is not available in sample mode` : undefined,
      duration: 3000,
    });
  }, []);

  // Compute sample templates: use cloud templates if available, fall back to built-ins
  const sampleTemplates = useMemo(() => {
    // If cloud templates were fetched and there are any, convert them to SampleTemplate format
    if (cloudTemplatesLoaded && cloudTemplates.length > 0) {
      return cloudTemplates
        .filter(ct => ct.snapshot)
        .map((ct, idx) => {
          const snap = ct.snapshot!;
          const proj = snap.project || {} as any;
          // ── Diagnostic: log snapshot token data from server ──
          console.log(`📋 Cloud template #${idx} snapshot: ${(snap.nodes || []).length} nodes, ${(snap.tokens || []).length} tokens, ${(snap.groups || []).length} groups`);
          // Backend returns `projectId`, frontend type says `templateId`
          const tmplId = ct.templateId || (ct as any).projectId || `cloud-tmpl-${idx}`;
          // Backend sends `name: snapshot?.name ?? 'Untitled'` but the actual name
          // lives inside `snapshot.project.name`. Prefer the snapshot's project name.
          const resolvedName = proj.name || (ct.name && ct.name !== 'Untitled' ? ct.name : null) || 'Untitled Template';
          // Remap projectId on all entities
          const rawNodes = (snap.nodes || []).map((n: any) => ({ ...n, projectId: 'sample-project' }));
          const rawTokens = (snap.tokens || []).map((t: any) => ({ ...t, projectId: 'sample-project' }));
          const rawGroups = (snap.groups || []).map((g: any) => ({ ...g, projectId: 'sample-project' }));
          const rawThemes = (snap.themes || []).map((t: any) => ({ ...t, projectId: 'sample-project' }));

          // Reconstruct any auto-assigned tokens missing from the snapshot
          const reconstructed = reconstructAutoAssignedTokens(rawNodes, rawTokens, rawGroups, rawThemes, 'sample-project');

          return {
            id: tmplId,
            name: resolvedName,
            description: ct.description || '',
            folderColor: proj.folderColor ?? ((tmplId.charCodeAt(0) * 137 + idx * 73) % 360),
            project: { ...proj, id: 'sample-project', isSample: true } as any,
            nodes: reconstructed.nodes,
            tokens: reconstructed.tokens,
            groups: reconstructed.groups,
            pages: (snap.pages || []).map((p: any) => ({ ...p, projectId: 'sample-project' })),
            themes: rawThemes,
            canvasStates: (snap.canvasStates || []).map((cs: any) => ({ ...cs, projectId: 'sample-project' })),
            _origIdx: idx,
            projectId: 'sample-project',
          };
        });
    }
    // Fallback to built-in templates
    return getBuiltInTemplates().map((t, idx) => ({
      ...t,
      _origIdx: idx,
      projectId: t.project.id,
    }));
  }, [cloudTemplates, cloudTemplatesLoaded]);

  const filteredSampleTemplates = useMemo(() => {
    if (!sampleTemplateSearch.trim()) return sampleTemplates;
    const q = sampleTemplateSearch.toLowerCase();
    return sampleTemplates.filter(t =>
      t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }, [sampleTemplates, sampleTemplateSearch]);

  const activeSampleIdx = useMemo(() => {
    return sampleTemplates.findIndex(t => t.id === activeSampleTemplateId);
  }, [sampleTemplates, activeSampleTemplateId]);

  // Switch the active sample template — swaps nodes/tokens/groups/pages/themes for the sample project
  const handleSwitchSampleTemplate = useCallback((idx: number) => {
    const template = sampleTemplates[idx];
    if (!template) return;
    const pid = 'sample-project';

    // ── Diagnostic logging ──
    console.log(`📋 Switching to template: "${template.name}" (${template.id}) — ${template.nodes.length} nodes, ${template.tokens.length} tokens, ${template.groups.length} groups`);

    // Remove old sample data, then insert new template data
    setAllNodes(prev => [...prev.filter(n => n.projectId !== pid), ...template.nodes]);
    setTokens(prev => [...prev.filter(t => t.projectId !== pid), ...template.tokens]);
    setGroups(prev => [...prev.filter(g => g.projectId !== pid), ...template.groups]);
    setPages(prev => [...prev.filter(p => p.projectId !== pid), ...template.pages]);
    setThemes(prev => [...prev.filter(t => t.projectId !== pid), ...template.themes]);
    setCanvasStates(prev => [...prev.filter(cs => cs.projectId !== pid), ...template.canvasStates]);

    // Update the project entry
    setProjects(prev => prev.map(p =>
      p.id === pid
        ? { ...p, name: template.project.name, folderColor: template.project.folderColor ?? 145 }
        : p
    ));

    // Set active page/theme from template
    if (template.pages.length > 0) setActivePageId(template.pages[0].id);
    if (template.themes.length > 0) setActiveThemeId(template.themes[0].id);

    setActiveSampleTemplateId(template.id);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSampleTemplateSearch('');

    // Update URL to reflect the active template
    const templateSlug = slugify(template.name || 'untitled');
    navigate(`/sample-project/${templateSlug}`, { replace: true });
    lastSyncedPathnameRef.current = `/sample-project/${templateSlug}`;

    // After React renders the new nodes, center the canvas on them
    setTimeout(() => {
      window.dispatchEvent(new Event('canvasFitAll'));
    }, 150);
  }, [sampleTemplates, navigate]);

  // Auto-switch to correct cloud template when templates arrive.
  // Handles two cases:
  // 1. User is on `/sample-project/:slug` before templates loaded → find & activate that template
  // 2. Current activeSampleTemplateId doesn't match any template → switch to first one
  useEffect(() => {
    if (!cloudTemplatesLoaded || cloudTemplates.length === 0 || sampleTemplates.length === 0) return;

    // Check if URL is a /sample-project path and match by slug
    const path = window.location.pathname;

    // ── Skip if we're on a community page — don't auto-switch to sample ──
    if (path === '/community' || path.startsWith('/community/')) return;
    // Also skip if we're on a regular project page
    if (path.startsWith('/project/') || path === '/projects') return;

    const sampleMatch = path.match(/^\/sample-project(?:\/([^/]+))?$/);
    if (sampleMatch) {
      const templateSlug = sampleMatch[1];
      if (templateSlug) {
        const matchingIdx = sampleTemplates.findIndex(t => slugify(t.name) === templateSlug);
        if (matchingIdx >= 0) {
          console.log(`📋 URL-matched cloud template: ${sampleTemplates[matchingIdx].name}`);
          handleSwitchSampleTemplate(matchingIdx);
          return;
        }
      }
      // Bare /sample-project or unmatched slug — switch to first template
      console.log(`📋 Redirecting to first cloud template: ${sampleTemplates[0].name}`);
      handleSwitchSampleTemplate(0);
      return;
    }

    // Fallback: if current template ID doesn't match any loaded template, switch to first
    // BUT only if we're actually viewing the sample project (not a community or regular project)
    const currentProject = useStore.getState().projects.find(p => p.id === activeProjectId);
    if (currentProject?.isSample && !activeProjectId?.startsWith('community-')) {
      const currentExists = sampleTemplates.some(t => t.id === activeSampleTemplateId);
      if (!currentExists) {
        const firstTemplate = sampleTemplates[0];
        console.log(`📋 Auto-switching to first cloud template: ${firstTemplate.name}`);
        handleSwitchSampleTemplate(0);
      }
    }
  }, [cloudTemplatesLoaded, cloudTemplates, sampleTemplates]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    sampleTemplates,
    filteredSampleTemplates,
    activeSampleIdx,
    sampleModeToast,
    handleSwitchSampleTemplate,
    isSampleMode,
    isSampleModeRef,
    reconstructAutoAssignedTokens,
  };
}
