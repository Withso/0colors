/**
 * useLocalStorageRestore — extracted from App.tsx
 *
 * Handles:
 *   1. Loading data on mount — tries IndexedDB first, falls back to localStorage
 *      (node migrations, token/group migrations, data integrity checks,
 *       state hydration, auth/config hydration, URL state hydration,
 *       undo middleware seeding)
 *   2. Persisting advancedLogic to localStorage on change
 */

import { useEffect } from 'react';
import { useStore, undoMiddleware } from '../store';
import {
  getDefaultData,
  mergeGroupExpandStates,
  loadFromLocalStorage,
} from '../utils/app-helpers';
import { migrateAdvancedLogic } from '../utils/migrations';
import { loadLocalConversations } from '../utils/ai-provider';
import { loadAllFromDB } from '../db';
import { migrateLocalStorageToIndexedDB } from '../db/migrate-from-localstorage';

// Auth session key (same as in App.tsx / useCloudSyncAuth)
const AUTH_SESSION_KEY = '0colors-auth-session';

interface LocalStorageRestoreRefs {
  lastSyncedAtMapRef: React.MutableRefObject<Record<string, string>>;
  viewingProjectsRef: React.MutableRefObject<boolean>;
  computedTokensRef: React.MutableRefObject<any>;
}

export function useLocalStorageRestore(refs: LocalStorageRestoreRefs) {
  const { lastSyncedAtMapRef, viewingProjectsRef, computedTokensRef } = refs;

  // ── Store state used for the persist effect ──
  const advancedLogic = useStore(s => s.advancedLogic);
  // Use the same derivation as everywhere else: project.isSample flag
  const activeProjectId = useStore(s => s.activeProjectId);
  const projects = useStore(s => s.projects);
  const isSampleMode = projects.find(p => p.id === activeProjectId)?.isSample === true;

  // ── Load data on mount (IndexedDB primary, localStorage fallback) ──
  useEffect(() => {
    const defaultData = getDefaultData();

    // Try IndexedDB first, then fall back to localStorage
    const loadData = async (): Promise<any> => {
      try {
        // Attempt to migrate from localStorage if not done yet
        await migrateLocalStorageToIndexedDB();

        // Load from IndexedDB
        const idbData = await loadAllFromDB();
        if (idbData && idbData.projects.length > 0) {
          console.log(`📋 Loaded from IndexedDB: ${idbData.projects.length} projects, ${idbData.allNodes.length} nodes`);
          return {
            nodes: idbData.allNodes,
            tokens: idbData.tokens,
            groups: idbData.groups,
            projects: idbData.projects,
            pages: idbData.pages,
            themes: idbData.themes,
            canvasStates: idbData.canvasStates,
            advancedLogic: idbData.advancedLogic,
            schemaVersion: idbData.schemaVersion,
          };
        }
      } catch (err) {
        console.warn('[Restore] IndexedDB load failed, falling back to localStorage:', err);
      }

      // Fallback to localStorage
      return loadFromLocalStorage();
    };

    loadData().then(storedData => {
      hydrateFromStoredData(storedData, defaultData);
    });

    function hydrateFromStoredData(storedData: any, defaultData: any) {
      // If no stored data (brand new user), keep the default sample project
      // from getDefaultData(). Just unblock the app so routing can proceed.
      if (!storedData) {
        console.log('📋 No stored data — brand new user, using defaults');
        setTimeout(() => {
          undoMiddleware.seed();
          useStore.setState({ isInitialLoad: false });
        }, 0);
        return;
      }
      if (storedData) {
      // Migration: convert old tokenId to tokenIds array and add colorSpace
      const migratedNodes = (storedData.nodes || []).map((node: any) => {
        let migrated = { ...node };

        // Migration 1: tokenId -> tokenIds
        if (node.tokenId !== undefined && node.tokenIds === undefined) {
          const { tokenId, ...rest } = migrated;
          migrated = {
            ...rest,
            tokenIds: tokenId ? [tokenId] : [],
          };
        }

        // Migration 2: add colorSpace (default to 'hsl' for old nodes)
        if (!migrated.colorSpace) {
          migrated.colorSpace = 'hsl';
        }

        // Migration 3: add pageId (assign to page-1 for old nodes)
        if (!migrated.pageId) {
          migrated.pageId = 'page-1';
        }

        return migrated;
      });

      // Migrate tokens to have pageId
      const migratedTokens = (storedData.tokens || []).map((token: any) => {
        if (!token.pageId) {
          return { ...token, pageId: 'page-1' };
        }
        return token;
      });

      // Migrate groups to have pageId
      const migratedGroups = (storedData.groups || defaultData.groups).map((group: any) => {
        if (!group.pageId) {
          return { ...group, pageId: 'page-1' };
        }
        return group;
      });

      // DATA INTEGRITY CHECK (non-destructive — log warnings but preserve all data)
      // Data is never auto-deleted; only explicit user actions (delete node, reset to defaults) remove data.
      const loadedGroups = migratedGroups;
      const loadedTokens = migratedTokens || defaultData.tokens;

      console.log('📋 Running data integrity check on load...');
      console.log(`Loaded data: ${migratedNodes.length} nodes, ${loadedGroups.length} groups, ${loadedTokens.length} tokens`);

      // Check for orphaned palette groups (palette entries without corresponding nodes)
      const paletteEntryGroups = loadedGroups.filter(g => g.isPaletteEntry);
      paletteEntryGroups.forEach(group => {
        const paletteNodeExists = migratedNodes.some(n => n.id === group.paletteNodeId && n.isPalette);
        if (!paletteNodeExists) {
          console.warn(`⚠️ Palette group "${group.name}" (${group.id}) has no matching palette node — data preserved`);
        }
      });

      // Check for tokens referencing non-existent groups
      const validGroupIds = new Set(loadedGroups.map(g => g.id));
      loadedTokens.forEach(t => {
        if (t.groupId && !validGroupIds.has(t.groupId)) {
          console.warn(`⚠️ Token "${t.name}" (${t.id}) references non-existent group ${t.groupId} — data preserved`);
        }
      });

      console.log('✅ Data integrity check complete — all data preserved');

      // Initialize lastSyncedAtMapRef from loaded projects so the
      // synchronous guard is correct from the very first cloud load.
      const projects = storedData.projects || defaultData.projects;
      for (const p of projects) {
        if (p.lastSyncedAt) {
          lastSyncedAtMapRef.current[p.id] = p.lastSyncedAt;
        }
      }

      // Batch all data hydration into a single setState call
      useStore.setState({
        allNodes: migratedNodes,
        tokens: loadedTokens,
        groups: mergeGroupExpandStates(loadedGroups),
        projects,
        pages: storedData.pages || defaultData.pages,
        themes: storedData.themes || defaultData.themes,
        canvasStates: storedData.canvasStates || defaultData.canvasStates,
        activeProjectId: storedData.activeProjectId || defaultData.activeProjectId,
        activePageId: storedData.activePageId || defaultData.activePageId,
        activeThemeId: storedData.activeThemeId || defaultData.activeThemeId,
      });

      // Hydrate advancedLogic from its separate localStorage key
      try {
        const storedLogic = localStorage.getItem('advanced-logic-v1');
        const parsed = storedLogic ? JSON.parse(storedLogic) : [];
        const { data, migrated } = migrateAdvancedLogic(parsed);
        if (migrated) {
          localStorage.setItem('advanced-logic-v1', JSON.stringify(data));
        }
        if (data.length > 0) useStore.setState({ advancedLogic: data });
      } catch { /* ignore */ }

      // viewingProjects no longer restored from localStorage — URL is source of truth.
      // The URL→state sync and home redirect effects handle navigation after restore.

      // Restore computed tokens from saved data or separate key
      if (storedData.computedTokens && typeof storedData.computedTokens === 'object') {
        computedTokensRef.current = storedData.computedTokens;
      } else {
        try {
          const savedComputed = localStorage.getItem('0colors-computed-tokens');
          if (savedComputed) {
            computedTokensRef.current = JSON.parse(savedComputed);
          }
        } catch { /* ignore */ }
      }
    }

      // Set timeout after state updates have settled
      setTimeout(() => {
        console.log('📋 Post-load state settled');
        // Seed undo middleware now that data hydration is complete
        undoMiddleware.seed();
        useStore.setState({ isInitialLoad: false });
      }, 0);
    } // end hydrateFromStoredData

    // ── Hydrate localStorage-derived auth/config state SYNCHRONOUSLY (runs immediately) ──
    {
      const authConfigPatch: Record<string, any> = {};

      try {
        const savedAuth = localStorage.getItem(AUTH_SESSION_KEY);
        if (savedAuth) authConfigPatch.authSession = JSON.parse(savedAuth);
      } catch { /* ignore */ }

      authConfigPatch.authSkipped = localStorage.getItem('0colors-auth-skipped') === 'true';

      try {
        const savedHexSpaces = localStorage.getItem('tokenTableHexSpaces');
        if (savedHexSpaces) authConfigPatch.tokenTableHexSpaces = new Set(JSON.parse(savedHexSpaces));
      } catch { /* ignore */ }

      try {
        const savedDevConfigs = localStorage.getItem('0colors-dev-configs');
        if (savedDevConfigs) authConfigPatch.devConfigs = JSON.parse(savedDevConfigs);
      } catch { /* ignore */ }

      authConfigPatch.aiConversations = loadLocalConversations();

      try {
        authConfigPatch.aiChatDocked = localStorage.getItem('0colors-ai-chat-docked') === 'true';
      } catch { /* ignore */ }

      useStore.setState(authConfigPatch);
    }

    // ── Hydrate URL-derived navigation state SYNCHRONOUSLY ──
    {
      const p = window.location.pathname;
      const urlPatch: Record<string, any> = {};

      // viewingProjects: false when URL points at a project, sample-project, or community project
      if (p.startsWith('/project/') || p.startsWith('/sample-project') || (p.startsWith('/community/') && p !== '/community')) {
        urlPatch.viewingProjects = false;
        viewingProjectsRef.current = false;
      } else {
        urlPatch.viewingProjects = true;
        viewingProjectsRef.current = true;
      }

      // dashboardSection
      if (p === '/community' || p === '/community/') urlPatch.dashboardSection = 'community';
      else if (p === '/settings') urlPatch.dashboardSection = 'ai-settings';
      else if (p === '/profile') urlPatch.dashboardSection = 'profile';
      else urlPatch.dashboardSection = 'projects';

      // isCommunityMode & communitySlug
      const communityMatch = p.match(/^\/community\/([^/]+)$/);
      if (communityMatch) {
        urlPatch.isCommunityMode = true;
        urlPatch.communitySlug = communityMatch[1];
      }

      // viewMode
      const parts = p.split('/').filter(Boolean);
      if (parts[0] === 'project' && parts[2] === 'code') urlPatch.viewMode = 'code';
      else if (parts[0] === 'project' && parts[2] === 'export') urlPatch.viewMode = 'export';

      useStore.setState(urlPatch);
    }
  }, []);

  // Persist advanced logic (skip in sample mode — changes are transient)
  // Writes to both IndexedDB (primary) and localStorage (fallback)
  useEffect(() => {
    if (isSampleMode) return;
    // IndexedDB: already handled by the persistence middleware (advancedLogic is part of saveAllToDB)
    // localStorage: kept as fallback during migration period
    try {
      localStorage.setItem('advanced-logic-v1', JSON.stringify(advancedLogic));
    } catch { /* ignore quota errors */ }
  }, [advancedLogic, isSampleMode]);
}
