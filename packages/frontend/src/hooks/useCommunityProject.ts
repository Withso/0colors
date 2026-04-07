/**
 * useCommunityProject — extracted from App.tsx
 *
 * Handles:
 *   1. Loading a community project snapshot when /community/:slug is visited
 *   2. Resetting the communityLoadedRef when the slug changes
 */

import { useEffect } from 'react';
import { useStore } from '../store';
import { useNavigate } from 'react-router';
import { fetchCommunityProject } from '../utils/community-api';
import { reconstructAutoAssignedTokens } from './useSampleTemplates';
import { toast } from 'sonner';
import type { TokenProject } from '../types';

interface CommunityProjectRefs {
  communityLoadedRef: React.MutableRefObject<boolean>;
}

export function useCommunityProject(refs: CommunityProjectRefs) {
  const { communityLoadedRef } = refs;

  const navigate = useNavigate();

  // ── Store selectors ──
  const isCommunityMode = useStore(s => s.isCommunityMode);
  const communitySlug = useStore(s => s.communitySlug);

  // ── Load community project when /community/:slug is visited ──
  useEffect(() => {
    if (!isCommunityMode || !communitySlug) return;
    if (communityLoadedRef.current) return;
    communityLoadedRef.current = true;

    (async () => {
      const data = await fetchCommunityProject(communitySlug);
      if (!data || !data.snapshot) {
        toast.error('Community project not found');
        navigate('/community', { replace: true });
        useStore.setState({ isCommunityMode: false, communitySlug: null });
        communityLoadedRef.current = false;
        return;
      }

      // Inject the community project snapshot as a temporary isSample project
      const snap = data.snapshot;
      const projectId = `community-${data.projectId}`;
      const project: TokenProject = {
        id: projectId,
        name: data.title,
        isExpanded: true,
        isSample: true, // reuse sample mode read-only guards
        isCloud: false,
        folderColor: 160,
      };

      // Remap all entity projectIds to our temporary ID
      const remapPid = (items: any[]) => items.map(i => ({ ...i, projectId }));

      const rawNodes = remapPid(snap.nodes || []);
      const rawTokens = remapPid(snap.tokens || []);
      const rawGroups = remapPid(snap.groups || []);
      const newPages = remapPid(snap.pages || []);
      const rawThemes = remapPid(snap.themes || []);
      const newCanvasStates = (snap.canvasStates || []).map((cs: any) => ({ ...cs, projectId }));

      // Reconstruct any auto-assigned tokens missing from the snapshot
      const reconstructed = reconstructAutoAssignedTokens(rawNodes, rawTokens, rawGroups, rawThemes, projectId);
      const newNodes = reconstructed.nodes;
      const newTokens = reconstructed.tokens;
      const newGroups = reconstructed.groups;
      const newThemes = rawThemes;

      // ── Diagnostic logging: community project data ──
      console.log(`📋 Community project "${data.title}" (${communitySlug}): ${newNodes.length} nodes, ${newTokens.length} tokens, ${newGroups.length} groups`);

      // Replace existing community project data if reloading (batched)
      const state = useStore.getState();
      const patch: Record<string, any> = {
        allNodes: [...state.allNodes.filter(n => !n.projectId.startsWith('community-')), ...newNodes],
        tokens: [...state.tokens.filter(t => !t.projectId.startsWith('community-')), ...newTokens],
        groups: [...state.groups.filter(g => !g.projectId.startsWith('community-')), ...newGroups],
        pages: [...state.pages.filter(p => !p.projectId.startsWith('community-')), ...newPages],
        themes: [...state.themes.filter(t => !t.projectId.startsWith('community-')), ...newThemes],
        canvasStates: [...state.canvasStates.filter(cs => !cs.projectId.startsWith('community-')), ...newCanvasStates],
        projects: [...state.projects.filter(p => !p.id.startsWith('community-')), project],
        activeProjectId: projectId,
      };
      if (newPages.length > 0) patch.activePageId = newPages[0].id;
      const primaryTheme = newThemes.find((t: any) => t.isPrimary) || newThemes[0];
      if (primaryTheme) patch.activeThemeId = primaryTheme.id;
      useStore.setState(patch);

      // Store metadata for the read-only banner
      (window as any).__communityProjectMeta = {
        title: data.title,
        description: data.description,
        allowRemix: data.allowRemix,
        userName: data.userName,
        slug: data.slug,
      };
    })();
  }, [isCommunityMode, communitySlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset communityLoadedRef when slug changes
  useEffect(() => {
    communityLoadedRef.current = false;
  }, [communitySlug]);
}
