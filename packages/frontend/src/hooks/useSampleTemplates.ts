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
import { useReadOnlyState } from './useReadOnlyState';
import { useNavigate } from 'react-router';
import { type SampleTemplate } from '../utils/sample-templates';
import { getAutoAssignSuffixValue } from '../components/canvas/AutoAssignTokenMenu';
import { slugify } from '../utils/slugify';
import { toast } from 'sonner';
import type { CanvasState } from '../types';

/**
 * Pre-calculate the zoom-to-fit canvasState from node positions.
 * This is set as the initial canvasState so when nodes paint,
 * they're already visible in the correct viewport — no animation needed.
 *
 * Replicates the same math as ColorCanvas.handleFitAll but runs before render.
 */
function calculateFitAllCanvasState(
  nodes: { position: { x: number; y: number }; width?: number }[],
  pageId: string,
  projectId: string,
): CanvasState {
  // Estimate viewport dimensions (canvas area = window minus sidebar ~136px)
  const viewportW = (typeof window !== 'undefined' ? window.innerWidth : 1400) - 136;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 900;
  const centerX = viewportW / 2;
  const centerY = viewportH / 2;

  if (nodes.length === 0) {
    return { projectId, pageId, pan: { x: 0, y: 0 }, zoom: 1 };
  }

  const nodeHeight = 280;
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
  nodes.forEach(n => {
    const w = n.width || 240;
    mnX = Math.min(mnX, n.position.x);
    mnY = Math.min(mnY, n.position.y);
    mxX = Math.max(mxX, n.position.x + w);
    mxY = Math.max(mxY, n.position.y + nodeHeight);
  });

  const pad = 300;
  const pw = (mxX - mnX) + pad * 2;
  const ph = (mxY - mnY) + pad * 2;
  const zoom = Math.min(Math.max(Math.min(viewportW / pw, viewportH / ph), 0.1), 3);
  const ncx = (mnX + mxX) / 2;
  const ncy = (mnY + mxY) / 2;

  return {
    projectId,
    pageId,
    pan: { x: centerX - ncx * zoom, y: centerY - ncy * zoom },
    zoom,
  };
}

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

  // ── Sample mode (centralized via useReadOnlyState) ──
  const { isSampleMode } = useReadOnlyState();
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
    // No cloud templates available — return empty (no hardcoded fallbacks).
    // The cloud templates should always load from the backend. If they fail,
    // the sample projects section will be empty, which is correct.
    return [];
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

  // Switch the active sample template — swaps ALL data in ONE atomic setState.
  // Previously this was 8+ separate setState calls, causing a window where
  // activePageId pointed to a cloud project's page while nodes were being swapped.
  // The canvas would then render cloud project nodes in the sample project view.
  const handleSwitchSampleTemplate = useCallback((idx: number) => {
    const template = sampleTemplates[idx];
    if (!template) return;
    const pid = 'sample-project';

    // Pre-calculate zoom-to-fit canvasState from node positions
    const pageId = template.pages[0]?.id || 'page-1';
    const fitCanvasState = calculateFitAllCanvasState(template.nodes, pageId, pid);

    // ── SINGLE ATOMIC STATE UPDATE ──
    // All entity arrays + active IDs + UI state updated in one call.
    // This prevents any intermediate render where activePageId doesn't
    // match the nodes, which was causing the cloud-data-leak bug.
    const s = useStore.getState();
    useStore.setState({
      // Entity data: swap sample project data with template data
      allNodes: [...s.allNodes.filter(n => n.projectId !== pid), ...template.nodes],
      tokens: [...s.tokens.filter(t => t.projectId !== pid), ...template.tokens],
      groups: [...s.groups.filter(g => g.projectId !== pid), ...template.groups],
      pages: [...s.pages.filter(p => p.projectId !== pid), ...template.pages],
      themes: [...s.themes.filter(t => t.projectId !== pid), ...template.themes],
      canvasStates: [...s.canvasStates.filter(cs => cs.projectId !== pid), fitCanvasState],
      projects: s.projects.map(p =>
        p.id === pid
          ? { ...p, name: template.project.name, folderColor: template.project.folderColor ?? 145 }
          : p
      ),
      // Active IDs: ALL set atomically to prevent any render with mismatched IDs
      activeProjectId: pid,
      activePageId: template.pages[0]?.id || s.activePageId,
      activeThemeId: template.themes[0]?.id || s.activeThemeId,
      activeSampleTemplateId: template.id,
      // UI reset
      selectedNodeId: null,
      selectedNodeIds: [],
      sampleTemplateSearch: '',
    });

    // Update URL to reflect the active template
    const templateSlug = slugify(template.name || 'untitled');
    navigate(`/sample-project/${templateSlug}`, { replace: true });
    lastSyncedPathnameRef.current = `/sample-project/${templateSlug}`;
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
