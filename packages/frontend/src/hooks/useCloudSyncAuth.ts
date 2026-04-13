/**
 * useCloudSyncAuth — extracted from App.tsx
 *
 * Owns ALL cloud-sync and auth-related:
 *   • refs (authSessionRef, computedTokensRef, lastSyncedAtMapRef, etc.)
 *   • useEffects (session restore, sync init, dirty tracking, reconciliation, status listener, etc.)
 *   • useCallbacks (handleAuth, handleSignOut, handleSkipAuth, handleForceCloudRefresh, handleManualSync)
 *   • useMemos (effectiveCloudSyncStatus, activeProjectLastSyncedAt, cloudDirtyCount)
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useStore } from '../store';
import { useLocation } from 'react-router';

// ── Cloud sync & auth ──
import { getSupabaseClient } from '../utils/supabase/client';
import { initWriteThrough, destroyWriteThrough } from '../sync/write-through';
import { setIsLoadingCloudData } from '../store/middleware/persistence-middleware';
import {
  initCloudSync,
  destroyCloudSync,
  updateAccessToken,
  loadCloudProjects,
  loadSingleProject,
  getCloudMeta,
  loadPublicTemplates,
} from '../utils/supabase/cloud-sync';
import { forceSyncAll } from '../sync/write-through';
import type { ProjectSnapshot } from '../utils/supabase/cloud-sync';
import { migrateSnapshot, CURRENT_SCHEMA_VERSION } from '../utils/migrations';
import { computeAllProjectTokens, type ProjectComputedTokens } from '../utils/computed-tokens';
import { slugify } from '../utils/slugify';

// Auth session key (same as in App.tsx)
const AUTH_SESSION_KEY = '0colors-auth-session';

/**
 * Persist auth session to localStorage (including access token).
 * The access token is needed on page load for instant lock acquisition
 * and cloud sync — waiting for Supabase SDK refresh causes race conditions.
 */
function persistAuthSession(session: any) {
  if (!session) {
    localStorage.removeItem(AUTH_SESSION_KEY);
    return;
  }
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function useCloudSyncAuth() {
  // ────────────────────────────────────────────────────
  // Store selectors
  // ────────────────────────────────────────────────────
  const authSession = useStore(s => s.authSession);
  const setAuthSession = useStore(s => s.setAuthSession);
  const authChecking = useStore(s => s.authChecking);
  const setAuthChecking = useStore(s => s.setAuthChecking);
  const authSkipped = useStore(s => s.authSkipped);
  const setAuthSkipped = useStore(s => s.setAuthSkipped);
  const cloudSyncStatus = useStore(s => s.cloudSyncStatus);
  const setCloudSyncStatus = useStore(s => s.setCloudSyncStatus);
  const lastSyncError = useStore(s => s.lastSyncError);
  const setLastSyncError = useStore(s => s.setLastSyncError);
  const isOnline = useStore(s => s.isOnline);
  const setIsOnline = useStore(s => s.setIsOnline);

  const allNodes = useStore(s => s.allNodes);
  const setAllNodes = useStore(s => s.setAllNodes);
  const tokens = useStore(s => s.tokens);
  const setTokens = useStore(s => s.setTokens);
  const canvasStates = useStore(s => s.canvasStates);
  const setCanvasStates = useStore(s => s.setCanvasStates);
  const projects = useStore(s => s.projects);
  const setProjects = useStore(s => s.setProjects);
  const pages = useStore(s => s.pages);
  const setPages = useStore(s => s.setPages);
  const themes = useStore(s => s.themes);
  const setThemes = useStore(s => s.setThemes);
  const groups = useStore(s => s.groups);
  const setGroups = useStore(s => s.setGroups);
  const activeProjectId = useStore(s => s.activeProjectId);
  const setActiveProjectId = useStore(s => s.setActiveProjectId);
  const activePageId = useStore(s => s.activePageId);
  const setActivePageId = useStore(s => s.setActivePageId);
  const activeThemeId = useStore(s => s.activeThemeId);
  const setActiveThemeId = useStore(s => s.setActiveThemeId);
  const advancedLogic = useStore(s => s.advancedLogic);
  const setAdvancedLogic = useStore(s => s.setAdvancedLogic);

  const isInitialLoad = useStore(s => s.isInitialLoad);
  const isImporting = useStore(s => s.isImporting);
  const viewingProjects = useStore(s => s.viewingProjects);

  const setCloudTemplates = useStore(s => s.setCloudTemplates);
  const setCloudTemplatesLoaded = useStore(s => s.setCloudTemplatesLoaded);

  // ────────────────────────────────────────────────────
  // Routing hooks
  // ────────────────────────────────────────────────────
  const location = useLocation();

  // ────────────────────────────────────────────────────
  // Refs
  // ────────────────────────────────────────────────────
  const authSessionRef = useRef(authSession);
  authSessionRef.current = authSession;

  const viewingProjectsRef = useRef(viewingProjects);
  viewingProjectsRef.current = viewingProjects;

  const communityLoadedRef = useRef(false);

  const computedTokensRef = useRef<Record<string, ProjectComputedTokens>>({});

  // Helper: get project snapshot for cloud sync
  const getProjectSnapshotRef = useRef<(projectId: string) => ProjectSnapshot | null>(null);

  // Synchronous map of projectId → lastSyncedAt, updated immediately when
  // onSynced fires (before React commits the re-render).
  const lastSyncedAtMapRef = useRef<Record<string, number>>({});

  // Suppresses the markDirty effect while loadCloudData / reconcile is merging
  // server data into local state.
  const isLoadingCloudDataRef = useRef(false);

  // Tracks the entity array references that the sync system "knows about".
  // The markDirty effect only marks projects dirty when entities change
  // relative to this baseline — preventing sync-triggered changes from
  // being treated as user edits.
  const knownEntitiesRef = useRef<{
    allNodes: any; tokens: any; groups: any; pages: any;
    themes: any; canvasStates: any; advancedLogic: any;
  } | null>(null);

  const lastSyncedPathnameRef = useRef(location.pathname);

  const mountTimeRef = useRef(Date.now());

  // Ref for current project slug — updated whenever activeProjectId/projects change
  const activeProjectSlugRef = useRef('sample-project');

  // ────────────────────────────────────────────────────
  // CLOUD TEMPLATE FETCH (on mount)
  // ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    // Safety timeout: if template fetch takes >4s, fall back to built-in templates
    const timeout = setTimeout(() => {
      if (!cancelled) {
        console.log('📋 Cloud template fetch timed out — using built-in templates');
        setCloudTemplatesLoaded(true);
      }
    }, 4000);
    loadPublicTemplates().then(result => {
      if (cancelled) return;
      clearTimeout(timeout);
      console.log(`📋 Loaded ${result.templates.length} cloud template(s) from backend`);
      setCloudTemplates(result.templates);
      setCloudTemplatesLoaded(true);
      // Store the backend-persisted starred template ID in Zustand
      if (result.starredTemplateId) {
        useStore.setState({ starredTemplateId: result.starredTemplateId });
      }
    });
    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  // ────────────────────────────────────────────────────
  // COMPUTED TOKENS — derived per-project, per-theme resolved tokens
  // ────────────────────────────────────────────────────
  useEffect(() => {
    if (isInitialLoad) return;
    // Skip if no real projects loaded yet (only default sample-project in store)
    const realProjects = projects.filter(p => !p.isSample);
    if (realProjects.length === 0) return;

    const timeoutId = setTimeout(() => {
      try {
        // Pass previous computed tokens for rename detection
        const previousMap = computedTokensRef.current;
        const result = computeAllProjectTokens(
          projects,
          allNodes,
          tokens,
          groups,
          pages,
          themes,
          advancedLogic,
          Object.keys(previousMap).length > 0 ? previousMap : undefined,
        );
        computedTokensRef.current = result;

        // Persist to localStorage
        try {
          localStorage.setItem('0colors-computed-tokens', JSON.stringify(result));
        } catch { /* ignore quota errors */ }

        // Log summary
        let totalTokens = 0;
        let totalRenames = 0;
        for (const proj of Object.values(result)) {
          for (const theme of proj.themes) {
            totalTokens += theme.tokens.length;
          }
          totalRenames += proj.renames?.length || 0;
        }
        console.log(`🧮 Computed tokens updated: ${Object.keys(result).length} projects, ${totalTokens} total tokens across all themes${totalRenames > 0 ? `, ${totalRenames} renames detected` : ''}`);
      } catch (err) {
        console.error('🧮 Computed tokens error:', err);
      }
    }, 1500); // Slightly longer debounce than save (1s) to avoid double-work

    return () => clearTimeout(timeoutId);
  }, [allNodes, tokens, groups, projects, pages, themes, advancedLogic, isInitialLoad]);

  // ════════════════════════════════════════════════════
  // AUTH is now handled by ZerosAuthProvider (shared @0zerosdesign/auth-client).
  // useAuthBridge syncs ZerosAuth → Zustand store.
  // This hook only handles cloud sync, templates, and computed tokens.
  // ════════════════════════════════════════════════════

  // ────────────────────────────────────────────────────
  // getProjectSnapshot — always reads from REFS (latest state)
  // ────────────────────────────────────────────────────
  getProjectSnapshotRef.current = (projectId: string): ProjectSnapshot | null => {
    const project = useStore.getState().projects.find(p => p.id === projectId);
    if (!project || project.isSample) return null;

    const curNodes = useStore.getState().allNodes;
    const projectNodes = curNodes.filter(n => n.projectId === projectId);
    const projectNodeIds = new Set(projectNodes.map(n => n.id));

    return {
      project,
      nodes: projectNodes,
      tokens: useStore.getState().tokens.filter(t => t.projectId === projectId),
      groups: useStore.getState().groups.filter(g => g.projectId === projectId),
      pages: useStore.getState().pages.filter(p => p.projectId === projectId),
      themes: useStore.getState().themes.filter(t => t.projectId === projectId),
      // canvasStates stripped from cloud snapshots to save storage (~5-20 KB/project).
      canvasStates: [],
      advancedLogic: useStore.getState().advancedLogic.filter(l => projectNodeIds.has(l.nodeId)),
      computedTokens: computedTokensRef.current[projectId],
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
  };

  // ── Keep activeProjectSlugRef in sync ──
  useEffect(() => {
    const project = projects.find(p => p.id === activeProjectId);
    activeProjectSlugRef.current = slugify(project?.name || 'untitled');
  }, [projects, activeProjectId]);

  // ────────────────────────────────────────────────────
  // CLOUD SYNC INIT (when auth session is available)
  // ────────────────────────────────────────────────────
  useEffect(() => {
    if (!authSession) {
      destroyCloudSync();
      return;
    }

    let loadCancelled = false; // Cancellation flag — prevents stale loadCloudData from modifying state when token refreshes

    // Set the loading guard SYNCHRONOUSLY so the markDirty effect (which runs
    // later in the same render cycle) sees it and skips. loadCloudData is async
    // and wouldn't set this flag in time otherwise.
    isLoadingCloudDataRef.current = true; setIsLoadingCloudData(true);

    // Initialize write-through sync (immediate save to IndexedDB + cloud on every action)
    initWriteThrough({
      getToken: () => authSessionRef.current?.accessToken || null,
      getSnapshot: (pid) => getProjectSnapshotRef.current?.(pid) || null,
      onSyncStatusChange: (status) => {
        if (status === 'synced') setCloudSyncStatus('synced');
        else if (status === 'syncing') setCloudSyncStatus('syncing');
        else if (status === 'error') setCloudSyncStatus('error');
        else if (status === 'offline') setCloudSyncStatus('offline');
      },
      onProjectSynced: (projectId, syncedAt) => {
        // Update the project's lastSyncedAt timestamp in the store
        // This is what the CloudSyncIndicator reads for "Last saved: Just now"
        lastSyncedAtMapRef.current[projectId] = syncedAt;
        setIsLoadingCloudData(true); // Prevent middleware from re-syncing this update
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, lastSyncedAt: syncedAt } : p
        ));
        setTimeout(() => setIsLoadingCloudData(false), 50);
      },
      onReconnected: () => {
        // After flushing local queue on reconnect, pull latest from cloud
        // (another device may have edited while we were offline)
        console.log('☁️ [Reconnect] Pulling latest from cloud after queue flush');
        loadCloudData();
      },
    });

    // Cloud sync still handles initial data load, reconciliation, and batch operations
    initCloudSync({
      accessToken: authSession.accessToken,
      getSnapshot: (pid) => getProjectSnapshotRef.current?.(pid) || null,
      onStart: () => {
        setCloudSyncStatus('syncing');
      },
      onComplete: (success, pids) => {
        if (success) {
          setCloudSyncStatus('synced');
          setLastSyncError(undefined);
          console.log(`☁️ Cloud sync complete for ${pids.length} projects`);
        } else {
          setCloudSyncStatus('error');
        }
      },
      onError: (err) => {
        setCloudSyncStatus('error');
        setLastSyncError(String(err));
        console.log(`☁️ Cloud sync error: ${err}`);
        // Show the actual error reason so the user can diagnose
        const reason = String(err).replace(/^Sync (failed|error):?\s*/i, '');
        toast.error(`Cloud sync failed — ${reason}`, { duration: 6000 });
      },
      onTokenExpired: async () => {
        // Sync got 401 — the access token is expired. Try to recover.
        try {
          const sb = getSupabaseClient();

          // Step 1: Check if the SDK's auto-refresh already obtained a fresh token.
          // (autoRefreshToken: true may have fired between the failed sync and now.)
          const { data: currentSession } = await sb.auth.getSession();
          const currentToken = currentSession?.session?.access_token;
          const staleToken = authSessionRef.current?.accessToken;

          if (currentToken && currentToken !== staleToken) {
            console.log('🔑 SDK already has a fresh token — using it');
            setAuthSession((prev: any) => {
              if (!prev) return prev;
              const updated = { ...prev, accessToken: currentToken };
              // Auth persistence handled by ZerosAuthProvider
              return updated;
            });
            updateAccessToken(currentToken);
            return currentToken;
          }

          // Step 2: Explicitly request a refresh.
          console.log('🔑 Requesting explicit token refresh after sync 401…');
          const { data, error } = await sb.auth.refreshSession();
          if (data?.session?.access_token) {
            console.log('🔑 Token refreshed after sync 401');
            const newToken = data.session.access_token;
            setAuthSession((prev: any) => {
              if (!prev) return prev;
              const updated = { ...prev, accessToken: newToken };
              // Auth persistence handled by ZerosAuthProvider
              return updated;
            });
            updateAccessToken(newToken);
            return newToken;
          }
          if (error) console.log(`🔑 Token refresh after 401 failed: ${error.message}`);
        } catch (e) {
          console.log(`🔑 Token refresh after 401 error: ${e}`);
        }
        // Token refresh failed completely — sign out
        console.log('🔑 All token refresh attempts failed — signing out');
        setAuthSession(null);
        localStorage.removeItem(AUTH_SESSION_KEY);
        destroyCloudSync();
        toast.error('Session expired — please sign in again', { duration: 5000 });
        return null;
      },
      onSynced: (pids, timestamps) => {
        // Update synchronous ref IMMEDIATELY — this ensures loadCloudData
        // (which may be awaiting a response right now) will see the correct
        // lastSyncedAt even before React commits the re-render.
        for (const pid of pids) {
          if (timestamps[pid]) {
            lastSyncedAtMapRef.current[pid] = timestamps[pid];
          }
        }
        // Update lastSyncedAt for synced projects (async via React state)
        setProjects(prev => prev.map(p => {
          if (timestamps[p.id]) {
            return { ...p, lastSyncedAt: timestamps[p.id] };
          }
          return p;
        }));
      },
      onVisibilityResume: () => {
        // Tab regained focus — refetch active project from cloud to pick up
        // changes made in other browsers/devices. This is the ONLY mechanism
        // for cross-browser sync (BroadcastChannel only works same-browser).
        const token = authSessionRef.current?.accessToken;
        if (!token) return;
        const currentActiveId = useStore.getState().activeProjectId;
        const currentProject = useStore.getState().projects.find(p => p.id === currentActiveId);
        if (currentProject?.isSample) return; // Don't refetch sample projects

        console.log(`☁️ [VisibilityResume] Refetching active project "${currentProject.name}" from cloud`);
        // Use loadCloudProjects to get all projects, then reconcile
        // We need to use the loadCloudProjects function with the current token
        (async () => {
          try {
            // Flush any dirty local changes first
            // Flush any pending write-through syncs before pulling
            {
              await forceSyncAll().catch(() => {});
            }

            const cloudData = await loadCloudProjects(token).catch(() => []);
            if (cloudData.length === 0) return;

            // Find the active project in the cloud data
            const remoteEntry = cloudData.find((e: any) => e.projectId === currentActiveId);
            if (!remoteEntry?.snapshot) return;

            const remoteSyncedAt = (remoteEntry.snapshot as any)?._syncedAt || 0;
            const localSyncedAt = lastSyncedAtMapRef.current[currentActiveId] || currentProject.lastSyncedAt || 0;

            if (remoteSyncedAt <= localSyncedAt) {
              console.log(`☁️ [VisibilityResume] Active project is up-to-date (remote=${remoteSyncedAt}, local=${localSyncedAt})`);
              return;
            }

            // Remote is newer — merge it
            console.log(`☁️ [VisibilityResume] Remote is newer (remote=${remoteSyncedAt} > local=${localSyncedAt}) — merging`);
            isLoadingCloudDataRef.current = true; setIsLoadingCloudData(true);

            let snapshot = remoteEntry.snapshot;
            const migResult = migrateSnapshot(snapshot);
            if (migResult.migrated) snapshot = migResult.snapshot as ProjectSnapshot;

            lastSyncedAtMapRef.current[currentActiveId] = remoteSyncedAt;

            const s = useStore.getState();
            const projectNodeIds = new Set((snapshot.nodes || []).map((n: any) => n.id));
            useStore.setState({
              projects: s.projects.map(p => p.id === currentActiveId ? { ...snapshot.project, isCloud: true, lastSyncedAt: remoteSyncedAt } : p),
              allNodes: [...s.allNodes.filter(n => n.projectId !== currentActiveId), ...(snapshot.nodes || [])],
              tokens: [...s.tokens.filter(t => t.projectId !== currentActiveId), ...(snapshot.tokens || [])],
              groups: [...s.groups.filter(g => g.projectId !== currentActiveId), ...(snapshot.groups || [])],
              pages: [...s.pages.filter(p => p.projectId !== currentActiveId), ...(snapshot.pages || [])],
              themes: [...s.themes.filter(t => t.projectId !== currentActiveId), ...(snapshot.themes || [])],
              canvasStates: [...s.canvasStates.filter(cs => cs.projectId !== currentActiveId), ...(snapshot.canvasStates || [])],
              advancedLogic: snapshot.advancedLogic?.length
                ? [...s.advancedLogic.filter(l => !projectNodeIds.has(l.nodeId)), ...snapshot.advancedLogic]
                : s.advancedLogic,
            });

            // Update known entities baseline to prevent markDirty false positive
            const ns = useStore.getState();
            knownEntitiesRef.current = {
              allNodes: ns.allNodes, tokens: ns.tokens, groups: ns.groups,
              pages: ns.pages, themes: ns.themes, canvasStates: ns.canvasStates,
              advancedLogic: ns.advancedLogic,
            };

            console.log(`☁️ [VisibilityResume] Merged remote changes for "${currentProject.name}"`);
          } catch (e) {
            console.log(`☁️ [VisibilityResume] Error: ${e}`);
          } finally {
            setTimeout(() => { isLoadingCloudDataRef.current = false; setIsLoadingCloudData(false); }, 100);
          }
        })();
      },
      onRemotePoll: () => {
        // Lightweight poll: fetch ONLY the active project from the server every 30s.
        // This is the primary mechanism for cross-browser sync — BroadcastChannel
        // only works within the same browser, and visibilitychange only fires on
        // tab switch. Polling catches changes from other browsers/devices.
        const token = authSessionRef.current?.accessToken;
        if (!token) return;
        const currentActiveId = useStore.getState().activeProjectId;
        const currentProject = useStore.getState().projects.find(p => p.id === currentActiveId);
        if (!currentProject?.isCloud) return;
        // Don't poll if we have dirty local changes (we'd overwrite them)
        // Write-through ensures data is already synced

        loadSingleProject(currentActiveId, token).then(snapshot => {
          if (!snapshot) return;
          const remoteSyncedAt = (snapshot as any)?._syncedAt || 0;
          const localSyncedAt = lastSyncedAtMapRef.current[currentActiveId] || currentProject.lastSyncedAt || 0;
          if (remoteSyncedAt <= localSyncedAt) return; // No changes

          console.log(`☁️ [RemotePoll] Remote is newer for "${currentProject.name}" (remote=${remoteSyncedAt} > local=${localSyncedAt}) — merging`);
          isLoadingCloudDataRef.current = true; setIsLoadingCloudData(true);

          const migResult = migrateSnapshot(snapshot);
          const merged = migResult.migrated ? migResult.snapshot as ProjectSnapshot : snapshot;
          lastSyncedAtMapRef.current[currentActiveId] = remoteSyncedAt;

          const s = useStore.getState();
          const projectNodeIds = new Set((merged.nodes || []).map((n: any) => n.id));
          useStore.setState({
            projects: s.projects.map(p => p.id === currentActiveId ? { ...merged.project, isCloud: true, lastSyncedAt: remoteSyncedAt } : p),
            allNodes: [...s.allNodes.filter(n => n.projectId !== currentActiveId), ...(merged.nodes || [])],
            tokens: [...s.tokens.filter(t => t.projectId !== currentActiveId), ...(merged.tokens || [])],
            groups: [...s.groups.filter(g => g.projectId !== currentActiveId), ...(merged.groups || [])],
            pages: [...s.pages.filter(p => p.projectId !== currentActiveId), ...(merged.pages || [])],
            themes: [...s.themes.filter(t => t.projectId !== currentActiveId), ...(merged.themes || [])],
            canvasStates: [...s.canvasStates.filter(cs => cs.projectId !== currentActiveId), ...(merged.canvasStates || [])],
            advancedLogic: merged.advancedLogic?.length
              ? [...s.advancedLogic.filter(l => !projectNodeIds.has(l.nodeId)), ...merged.advancedLogic]
              : s.advancedLogic,
          });

          const ns = useStore.getState();
          knownEntitiesRef.current = {
            allNodes: ns.allNodes, tokens: ns.tokens, groups: ns.groups,
            pages: ns.pages, themes: ns.themes, canvasStates: ns.canvasStates,
            advancedLogic: ns.advancedLogic,
          };
          setTimeout(() => { isLoadingCloudDataRef.current = false; setIsLoadingCloudData(false); }, 100);
          console.log(`☁️ [RemotePoll] Merged remote changes`);
        }).catch(e => {
          console.log(`☁️ [RemotePoll] Error: ${e}`);
        });
      },
    });

    // Load cloud project data on first auth
    const loadCloudData = async () => {
      try {
        // ── Clear stale dirty flags from previous sessions ──
        // Cloud is the source of truth for cloud projects. Stale dirty flags
        // from crashed/abandoned sessions should not prevent cloud data from loading.
          // Write-through sync handles saves — no dirty tracking to clear

        // ── Step 1+2: Fetch cloud metadata AND project snapshots IN PARALLEL ──
        // This is significantly faster than the previous sequential approach,
        // reducing post-login delay by ~50% (one RTT instead of two).
        const [cloudMeta, cloudData] = await Promise.all([
          getCloudMeta(authSession.accessToken).catch((e: any) => {
            console.log(`☁️ getCloudMeta failed: ${e}`);
            return null;
          }),
          loadCloudProjects(authSession.accessToken).catch((e: any) => {
            console.log(`☁️ loadCloudProjects FAILED: ${e}`);
            return [] as any[];
          }),
        ]);
        if (loadCancelled) return;

        // Apply cloud meta (admin status)
        console.log(`☁️ Cloud meta result:`, JSON.stringify(cloudMeta));
        if (cloudMeta) {
          const isAdmin = cloudMeta.isAdmin ?? false;
          const isTemplateAdmin = cloudMeta.isTemplateAdmin ?? false;
          console.log(`☁️ Admin status: isAdmin=${isAdmin}, isTemplateAdmin=${isTemplateAdmin}`);
          setAuthSession(prev => prev ? { ...prev, isAdmin, isTemplateAdmin } : prev);
          // Cache isTemplateAdmin for instant restore on next page load
          try { localStorage.setItem('0colors-isTemplateAdmin', String(isTemplateAdmin)); } catch {}
          const updatedSession = { ...authSession, isAdmin, isTemplateAdmin };
          // Auth persistence handled by ZerosAuthProvider
          if (isAdmin) {
            console.log(`[ADMIN] Logged in as admin${isTemplateAdmin ? ' + template admin' : ''} - unlimited cloud projects`);
          }
        }

        // ── Enhanced diagnostic logging ──
        const localCloudProjects = useStore.getState().projects.filter(p => !p.isSample);
        console.log(`☁️ ═══ CLOUD LOAD DIAGNOSTIC ═══`);
        console.log(`☁️ Server returned ${cloudData.length} project(s)`);
        console.log(`☁️ Server project IDs: ${cloudData.map((e: any) => e.projectId).join(', ') || '(none)'}`);
        console.log(`☁️ Server projects detail:`, cloudData.map((e: any) => ({
          id: e.projectId,
          name: e.snapshot?.project?.name,
          hasSnapshot: !!e.snapshot,
          _syncedAt: e.snapshot?._syncedAt,
          isCloud: e.snapshot?.project?.isCloud,
          isTemplate: e.snapshot?.project?.isTemplate,
          nodeCount: e.snapshot?.nodes?.length,
          tokenCount: e.snapshot?.tokens?.length,
        })));
        console.log(`☁️ Local cloud/template projects: ${localCloudProjects.map(p => `${p.id}("${p.name}")`).join(', ') || '(none)'}`);
        console.log(`☁️ lastSyncedAtMapRef:`, JSON.stringify(lastSyncedAtMapRef.current));
        console.log(`☁️ cloudMeta.cloudProjectIds: ${JSON.stringify(cloudMeta?.cloudProjectIds || [])}`);

        if (cloudData.length > 0) {
          // Suppress markDirty during merge — prevents wasteful re-upload cycle
          isLoadingCloudDataRef.current = true; setIsLoadingCloudData(true);

          // Accumulate ALL changes across ALL projects, then apply in one setState
          const s = useStore.getState();
          let accProjects = [...s.projects];
          let accNodes = [...s.allNodes];
          let accTokens = [...s.tokens];
          let accGroups = [...s.groups];
          let accPages = [...s.pages];
          let accThemes = [...s.themes];
          let accCanvasStates = [...s.canvasStates];
          let accAdvancedLogic = [...s.advancedLogic];
          let anyMerged = false;

          // Merge cloud data into local state
          for (const cloudEntry of cloudData) {
            if (!cloudEntry.snapshot) {
              console.log(`☁️ Skipping project ${cloudEntry.projectId} — null snapshot`);
              continue;
            }
            const projectId = cloudEntry.projectId;
            let snapshot = cloudEntry.snapshot;

            // ── Run schema migrations on cloud snapshot ──
            const migResult = migrateSnapshot(snapshot);
            if (migResult.migrated) {
              console.log(`🔄 Cloud migration for ${projectId}: ${migResult.appliedMigrations.join(', ')}`);
              snapshot = migResult.snapshot as ProjectSnapshot;
            }

            // Check if we already have this project locally.
            const existingProject = accProjects.find(p => p.id === projectId);
            const localSyncedAt = lastSyncedAtMapRef.current[projectId]
              || existingProject?.lastSyncedAt || 0;
            const remoteSyncedAt = (snapshot as any)._syncedAt || 0;

            // ── Cloud is source of truth: ALWAYS merge on initial load ──
            // Cloud data wins regardless of timestamps. IndexedDB is just a cache.
            const shouldMerge = true;

            if (shouldMerge) {
              console.log(`☁️ ${existingProject ? 'Updating' : 'Adding NEW'} cloud project "${snapshot.project?.name}" (${projectId}) — remote=${remoteSyncedAt}, local=${localSyncedAt}`);

              // Keep synchronous ref in sync with the new timestamp
              lastSyncedAtMapRef.current[projectId] = remoteSyncedAt || Date.now();

              // Accumulate project changes
              const existsInAcc = accProjects.find(p => p.id === projectId);
              if (existsInAcc) {
                accProjects = accProjects.map(p => p.id === projectId ? { ...snapshot.project, isCloud: true, lastSyncedAt: remoteSyncedAt } : p);
              } else {
                accProjects = [...accProjects, { ...snapshot.project, isCloud: true, lastSyncedAt: remoteSyncedAt }];
              }

              // Replace project-specific data (defensive || [] for missing arrays)
              accNodes = [...accNodes.filter(n => n.projectId !== projectId), ...(snapshot.nodes || [])];
              accTokens = [...accTokens.filter(t => t.projectId !== projectId), ...(snapshot.tokens || [])];
              accGroups = [...accGroups.filter(g => g.projectId !== projectId), ...(snapshot.groups || [])];
              accPages = [...accPages.filter(p => p.projectId !== projectId), ...(snapshot.pages || [])];
              accThemes = [...accThemes.filter(t => t.projectId !== projectId), ...(snapshot.themes || [])];
              accCanvasStates = [...accCanvasStates.filter(cs => cs.projectId !== projectId), ...(snapshot.canvasStates || [])];
              if (snapshot.advancedLogic?.length) {
                const remoteNodeIds = new Set(snapshot.nodes.map((n: any) => n.id));
                accAdvancedLogic = [...accAdvancedLogic.filter(l => !remoteNodeIds.has(l.nodeId)), ...snapshot.advancedLogic];
              }
              anyMerged = true;
            } else {
              console.log(`☁️ Skipping cloud overwrite for ${projectId} — local is up-to-date (remote=${remoteSyncedAt}, local=${localSyncedAt})`);
            }
          }

          // Apply ALL accumulated changes in ONE setState (1 re-render)
          if (anyMerged) {
            useStore.setState({
              projects: accProjects,
              allNodes: accNodes,
              tokens: accTokens,
              groups: accGroups,
              pages: accPages,
              themes: accThemes,
              canvasStates: accCanvasStates,
              advancedLogic: accAdvancedLogic,
            });
          }
          // NOTE: Don't reset isLoadingCloudDataRef here — it stays true
          // through Step 3 and gets reset in the finally block via setTimeout
        }

        // ── Step 3: Remove stale cloud/template projects that no longer exist on the server ──
        if (cloudMeta?.cloudProjectIds) {
          const serverProjectIds = new Set(cloudMeta.cloudProjectIds as string[]);
          // Also include IDs from cloudData (in case meta was slightly stale)
          for (const entry of cloudData) {
            if (entry.projectId) serverProjectIds.add(entry.projectId);
          }

          const staleIds: string[] = [];
          for (const p of useStore.getState().projects) {
            if (!p.isSample && !serverProjectIds.has(p.id)) {
              staleIds.push(p.id);
            }
          }

          if (staleIds.length > 0) {
            console.log(`☁️ Removing ${staleIds.length} stale cloud/template project(s) deleted on another device:`, staleIds);
            const staleSet = new Set(staleIds);

            const st = useStore.getState();
            const staleNodeIds = new Set(
              st.allNodes.filter(n => staleSet.has(n.projectId)).map(n => n.id)
            );
            useStore.setState({
              projects: st.projects.filter(p => !staleSet.has(p.id)),
              allNodes: st.allNodes.filter(n => !staleSet.has(n.projectId)),
              tokens: st.tokens.filter(t => !staleSet.has(t.projectId)),
              groups: st.groups.filter(g => !staleSet.has(g.projectId)),
              pages: st.pages.filter(p => !staleSet.has(p.projectId)),
              themes: st.themes.filter(t => !staleSet.has(t.projectId)),
              canvasStates: st.canvasStates.filter(cs => !staleSet.has(cs.projectId)),
              advancedLogic: staleNodeIds.size > 0 ? st.advancedLogic.filter(l => !staleNodeIds.has(l.nodeId)) : st.advancedLogic,
            });

            // Clean up stale lastSyncedAtMapRef entries
            for (const id of staleIds) delete lastSyncedAtMapRef.current[id];

            // If the active project was deleted on another device, switch to first available
            if (activeProjectId && staleSet.has(activeProjectId)) {
              const remaining = useStore.getState().projects.filter(p => !staleSet.has(p.id));
              if (remaining.length > 0) {
                setActiveProjectId(remaining[0].id);
                const firstPage = useStore.getState().pages.find(pg => pg.projectId === remaining[0].id);
                if (firstPage) setActivePageId(firstPage.id);
              }
            }
          }
        }
      } catch (e) {
        console.log(`☁️ Failed to load cloud data: ${e}`);
      } finally {
        // Snapshot current entities as the baseline so the markDirty effect
        // doesn't treat cloud-loaded data as user edits.
        const s = useStore.getState();
        knownEntitiesRef.current = {
          allNodes: s.allNodes, tokens: s.tokens, groups: s.groups,
          pages: s.pages, themes: s.themes, canvasStates: s.canvasStates,
          advancedLogic: s.advancedLogic,
        };
        // Defer the loading flag reset so it's still true when React processes
        // the batched state updates and fires the markDirty effect.
        setTimeout(() => { isLoadingCloudDataRef.current = false; setIsLoadingCloudData(false); }, 100);
      }
    };

    loadCloudData();

    return () => { loadCancelled = true; isLoadingCloudDataRef.current = false; setIsLoadingCloudData(false); destroyCloudSync(); destroyWriteThrough(); };
  }, [authSession?.accessToken]);

  // ────────────────────────────────────────────────────
  // FULL CLOUD RECONCILIATION (on projects page visit)
  // Cooldown: skip if last reconciliation was less than 60s ago.
  // This prevents wasteful repeated fetches when user switches
  // between projects page and canvas frequently.
  // ────────────────────────────────────────────────────
  const lastReconcileRef = useRef(0);

  useEffect(() => {
    if (!viewingProjects || !authSession) return;
    // Skip within first 5s of mount — loadCloudData already handles initial load
    if (Date.now() - mountTimeRef.current < 5000) return;
    // Skip if reconciled less than 60s ago
    if (Date.now() - lastReconcileRef.current < 60_000) return;

    let cancelled = false;
    const fullReconcile = async () => {
      try {
        // ── CRITICAL: Flush dirty local data to cloud BEFORE downloading ──
        // Flush any pending write-through syncs before reconciliation
        {
          await forceSyncAll().catch((e) => console.log('☁️ [Reconcile] Pre-reconcile flush failed:', e));
          if (cancelled) return;
        }

        const accessToken = authSessionRef.current?.accessToken || authSession.accessToken;
        // Fetch authoritative cloud meta + all snapshots in parallel
        const [meta, cloudData] = await Promise.all([
          getCloudMeta(accessToken).catch(() => null),
          loadCloudProjects(accessToken).catch(() => [] as any[]),
        ]);
        if (cancelled) return;
        if (!meta?.cloudProjectIds) {
          console.log(`☁️ [Reconcile] Could not fetch cloud meta — skipping`);
          return;
        }

        // Suppress markDirty AFTER fetch, right before state mutations begin
        isLoadingCloudDataRef.current = true; setIsLoadingCloudData(true);
        const serverIds = new Set(meta.cloudProjectIds as string[]);
        const localCloudCount = useStore.getState().projects.filter(p => !p.isSample).length;
        console.log(`☁️ [Reconcile] Server has ${serverIds.size} project(s), local has ${localCloudCount} cloud/template project(s)`);

        // ── Part A: ADD or UPDATE projects from cloud ──
        let addedCount = 0;
        let updatedCount = 0;

        // Accumulate ALL changes across ALL projects, then apply in one setState
        const rs = useStore.getState();
        let recProjects = [...rs.projects];
        let recNodes = [...rs.allNodes];
        let recTokens = [...rs.tokens];
        let recGroups = [...rs.groups];
        let recPages = [...rs.pages];
        let recThemes = [...rs.themes];
        let recCanvasStates = [...rs.canvasStates];
        let recAdvancedLogic = [...rs.advancedLogic];
        let anyReconciled = false;

        for (const entry of cloudData) {
          if (cancelled) return;
          if (!entry.snapshot) continue;
          const projectId = entry.projectId;
          let snapshot = entry.snapshot;

          const migResult = migrateSnapshot(snapshot);
          if (migResult.migrated) snapshot = migResult.snapshot as ProjectSnapshot;

          const existing = recProjects.find(p => p.id === projectId);
          const localSyncedAt = lastSyncedAtMapRef.current[projectId] || existing?.lastSyncedAt || 0;
          const remoteSyncedAt = (snapshot as any)._syncedAt || 0;

          if (!existing) {
            // NEW: project on server but not locally
            console.log(`☁️ [Reconcile] Adding missing project ${projectId} ("${snapshot.project?.name}")`);
            lastSyncedAtMapRef.current[projectId] = remoteSyncedAt || Date.now();

            if (!recProjects.find(p => p.id === projectId)) {
              recProjects = [...recProjects, { ...snapshot.project, isCloud: true, lastSyncedAt: remoteSyncedAt }];
            }
            recNodes = [...recNodes.filter(n => n.projectId !== projectId), ...(snapshot.nodes || [])];
            recTokens = [...recTokens.filter(t => t.projectId !== projectId), ...(snapshot.tokens || [])];
            recGroups = [...recGroups.filter(g => g.projectId !== projectId), ...(snapshot.groups || [])];
            recPages = [...recPages.filter(p => p.projectId !== projectId), ...(snapshot.pages || [])];
            recThemes = [...recThemes.filter(t => t.projectId !== projectId), ...(snapshot.themes || [])];
            recCanvasStates = [...recCanvasStates.filter(cs => cs.projectId !== projectId), ...(snapshot.canvasStates || [])];
            if (snapshot.advancedLogic?.length) {
              const nodeIds = new Set(snapshot.nodes.map((n: any) => n.id));
              recAdvancedLogic = [...recAdvancedLogic.filter(l => !nodeIds.has(l.nodeId)), ...snapshot.advancedLogic];
            }
            anyReconciled = true;
            addedCount++;
          } else if (remoteSyncedAt > localSyncedAt) {
            // ── CRITICAL GUARD: Never overwrite a project that still has dirty local changes ──
            if (false) { // Write-through ensures data is already synced
              console.log(`☁️ [Reconcile] SKIPPING overwrite for ${projectId} — project has dirty local changes (remote=${remoteSyncedAt}, local=${localSyncedAt})`);
              continue;
            }
            // UPDATED: cloud version is newer
            console.log(`☁️ [Reconcile] Updating project ${projectId} (remote=${remoteSyncedAt} > local=${localSyncedAt})`);
            lastSyncedAtMapRef.current[projectId] = remoteSyncedAt;

            recProjects = recProjects.map(p => p.id === projectId ? { ...snapshot.project, isCloud: true, lastSyncedAt: remoteSyncedAt } : p);
            recNodes = [...recNodes.filter(n => n.projectId !== projectId), ...(snapshot.nodes || [])];
            recTokens = [...recTokens.filter(t => t.projectId !== projectId), ...(snapshot.tokens || [])];
            recGroups = [...recGroups.filter(g => g.projectId !== projectId), ...(snapshot.groups || [])];
            recPages = [...recPages.filter(p => p.projectId !== projectId), ...(snapshot.pages || [])];
            recThemes = [...recThemes.filter(t => t.projectId !== projectId), ...(snapshot.themes || [])];
            recCanvasStates = [...recCanvasStates.filter(cs => cs.projectId !== projectId), ...(snapshot.canvasStates || [])];
            if (snapshot.advancedLogic?.length) {
              const nodeIds = new Set(snapshot.nodes.map((n: any) => n.id));
              recAdvancedLogic = [...recAdvancedLogic.filter(l => !nodeIds.has(l.nodeId)), ...snapshot.advancedLogic];
            }
            anyReconciled = true;
            updatedCount++;
          }
        }

        // Apply ALL accumulated changes in ONE setState (1 re-render)
        if (anyReconciled) {
          useStore.setState({
            projects: recProjects,
            allNodes: recNodes,
            tokens: recTokens,
            groups: recGroups,
            pages: recPages,
            themes: recThemes,
            canvasStates: recCanvasStates,
            advancedLogic: recAdvancedLogic,
          });
        }

        if (cancelled) return;

        // ── Part B: REMOVE local cloud/template projects not on server ──
        const staleIds: string[] = [];
        for (const p of useStore.getState().projects) {
          if (!p.isSample && !serverIds.has(p.id)) {
            staleIds.push(p.id);
          }
        }
        if (staleIds.length > 0) {
          console.log(`☁️ [Reconcile] Removing ${staleIds.length} stale project(s):`, staleIds);
          const staleSet = new Set(staleIds);
          const stState = useStore.getState();
          const staleNodeIds = new Set(
            stState.allNodes.filter(n => staleSet.has(n.projectId)).map(n => n.id)
          );
          useStore.setState({
            projects: stState.projects.filter(p => !staleSet.has(p.id)),
            allNodes: stState.allNodes.filter(n => !staleSet.has(n.projectId)),
            tokens: stState.tokens.filter(t => !staleSet.has(t.projectId)),
            groups: stState.groups.filter(g => !staleSet.has(g.projectId)),
            pages: stState.pages.filter(p => !staleSet.has(p.projectId)),
            themes: stState.themes.filter(t => !staleSet.has(t.projectId)),
            canvasStates: stState.canvasStates.filter(cs => !staleSet.has(cs.projectId)),
            advancedLogic: staleNodeIds.size > 0 ? stState.advancedLogic.filter(l => !staleNodeIds.has(l.nodeId)) : stState.advancedLogic,
          });
          for (const id of staleIds) delete lastSyncedAtMapRef.current[id];
        }

        if (addedCount > 0 || updatedCount > 0 || staleIds.length > 0) {
          console.log(`☁️ [Reconcile] Done: +${addedCount} added, ~${updatedCount} updated, -${staleIds.length} removed`);
        }
      } catch (e) {
        console.log(`☁️ [Reconcile] Error: ${e}`);
      } finally {
        const rs = useStore.getState();
        knownEntitiesRef.current = {
          allNodes: rs.allNodes, tokens: rs.tokens, groups: rs.groups,
          pages: rs.pages, themes: rs.themes, canvasStates: rs.canvasStates,
          advancedLogic: rs.advancedLogic,
        };
        setTimeout(() => { isLoadingCloudDataRef.current = false; setIsLoadingCloudData(false); }, 100);
        lastReconcileRef.current = Date.now();
      }
    };
    fullReconcile();
    return () => { cancelled = true; isLoadingCloudDataRef.current = false; setIsLoadingCloudData(false); };
  }, [viewingProjects, authSession]);

  // ────────────────────────────────────────────────────
  // MARK DIRTY — track cloud projects with local changes
  // ────────────────────────────────────────────────────
  // This effect must distinguish USER edits from SYNC-triggered state changes.
  // It uses knownEntitiesRef as a baseline: only changes relative to the
  // baseline are treated as user edits that need syncing.
  const isAuthenticated = !!authSession;
  useEffect(() => {
    if (isInitialLoad || isImporting || !isAuthenticated) return;

    const current = { allNodes, tokens, groups, pages, themes, canvasStates, advancedLogic };

    // While cloud data is loading (or on first auth), just snapshot the
    // current entity references as the baseline — don't mark dirty.
    if (isLoadingCloudDataRef.current || !knownEntitiesRef.current) {
      knownEntitiesRef.current = current;
      return;
    }

    // Compare against the baseline — if nothing changed, skip.
    const known = knownEntitiesRef.current;
    if (
      known.allNodes === allNodes && known.tokens === tokens &&
      known.groups === groups && known.pages === pages &&
      known.themes === themes && known.canvasStates === canvasStates &&
      known.advancedLogic === advancedLogic
    ) return;

    // Genuine change detected — update baseline and mark dirty.
    knownEntitiesRef.current = current;

    const cloudProjectIds = projects.filter(p => !p.isSample).map(p => p.id);
    for (const pid of cloudProjectIds) {
      // Write-through handles sync via persistence middleware
    }
    if (cloudProjectIds.length > 0 && cloudSyncStatus !== 'syncing') {
      setCloudSyncStatus('dirty');
    }
  }, [allNodes, tokens, groups, pages, themes, canvasStates, advancedLogic, isInitialLoad, isImporting, isAuthenticated]);

  // ────────────────────────────────────────────────────
  // AUTH CALLBACKS
  // ────────────────────────────────────────────────────
  const handleAuth = useCallback((session: { accessToken: string; userId: string; email: string; name: string }) => {
    setAuthSession(session);
    setAuthSkipped(false);
    // Auth persistence handled by ZerosAuthProvider
    localStorage.removeItem('0colors-auth-skipped');
    updateAccessToken(session.accessToken);
  }, []);

  // ── Force Cloud Refresh: bypass all caches/timestamps and re-download everything ──
  const handleForceCloudRefresh = useCallback(async () => {
    const token = authSessionRef.current?.accessToken;
    if (!token) {
      console.log(`☁️ [ForceRefresh] No auth token — cannot refresh`);
      return;
    }
    console.log(`☁️ ═══ FORCE CLOUD REFRESH START ═══`);
    setCloudSyncStatus('syncing');

    try {
      // 0. CRITICAL: Flush dirty local data to cloud FIRST
      // Flush pending write-through syncs before refresh
      {
        await forceSyncAll().catch((e) => console.log('☁️ [ForceRefresh] Pre-refresh flush failed:', e));
      }

      // 1. Clear ALL timestamp caches
      console.log(`☁️ [ForceRefresh] Clearing lastSyncedAtMapRef (had ${Object.keys(lastSyncedAtMapRef.current).length} entries)`);
      lastSyncedAtMapRef.current = {};

      // 2. Also clear lastSyncedAt on all local projects
      setProjects(prev => prev.map(p => !p.isSample ? { ...p, lastSyncedAt: 0 } : p));

      // 3. Fetch fresh data from server
      isLoadingCloudDataRef.current = true; setIsLoadingCloudData(true);
      const [meta, cloudData] = await Promise.all([
        getCloudMeta(token).catch((e: any) => { console.log(`☁️ [ForceRefresh] getCloudMeta FAILED: ${e}`); return null; }),
        loadCloudProjects(token).catch((e: any) => { console.log(`☁️ [ForceRefresh] loadCloudProjects FAILED: ${e}`); return [] as any[]; }),
      ]);

      console.log(`☁️ [ForceRefresh] Server meta: ${JSON.stringify(meta?.cloudProjectIds || [])}`);
      console.log(`☁️ [ForceRefresh] Server returned ${cloudData.length} snapshot(s)`);
      for (const entry of cloudData) {
        console.log(`☁️ [ForceRefresh]   → ${entry.projectId}: "${entry.snapshot?.project?.name}" hasSnap=${!!entry.snapshot} _syncedAt=${entry.snapshot?._syncedAt} nodes=${entry.snapshot?.nodes?.length} tokens=${entry.snapshot?.tokens?.length}`);
      }

      // 4. Force-merge ALL projects (no timestamp check)
      let added = 0, updated = 0;

      // Accumulate ALL changes across ALL projects, then apply in one setState
      const fs = useStore.getState();
      let frProjects = [...fs.projects];
      let frNodes = [...fs.allNodes];
      let frTokens = [...fs.tokens];
      let frGroups = [...fs.groups];
      let frPages = [...fs.pages];
      let frThemes = [...fs.themes];
      let frCanvasStates = [...fs.canvasStates];
      let frAdvancedLogic = [...fs.advancedLogic];

      for (const entry of cloudData) {
        if (!entry.snapshot) continue;
        const projectId = entry.projectId;
        let snapshot = entry.snapshot;

        const migResult = migrateSnapshot(snapshot);
        if (migResult.migrated) snapshot = migResult.snapshot as ProjectSnapshot;

        const existing = frProjects.find(p => p.id === projectId);
        const remoteSyncedAt = (snapshot as any)._syncedAt || Date.now();
        lastSyncedAtMapRef.current[projectId] = remoteSyncedAt;

        console.log(`☁️ [ForceRefresh] ${existing ? 'UPDATING' : 'ADDING'} "${snapshot.project?.name}" (${projectId})`);

        if (existing) {
          frProjects = frProjects.map(p => p.id === projectId ? { ...snapshot.project, isCloud: true, lastSyncedAt: remoteSyncedAt } : p);
        } else {
          frProjects = [...frProjects, { ...snapshot.project, isCloud: true, lastSyncedAt: remoteSyncedAt }];
        }
        frNodes = [...frNodes.filter(n => n.projectId !== projectId), ...(snapshot.nodes || [])];
        frTokens = [...frTokens.filter(t => t.projectId !== projectId), ...(snapshot.tokens || [])];
        frGroups = [...frGroups.filter(g => g.projectId !== projectId), ...(snapshot.groups || [])];
        frPages = [...frPages.filter(p => p.projectId !== projectId), ...(snapshot.pages || [])];
        frThemes = [...frThemes.filter(t => t.projectId !== projectId), ...(snapshot.themes || [])];
        frCanvasStates = [...frCanvasStates.filter(cs => cs.projectId !== projectId), ...(snapshot.canvasStates || [])];
        if (snapshot.advancedLogic?.length) {
          const nodeIds = new Set(snapshot.nodes.map((n: any) => n.id));
          frAdvancedLogic = [...frAdvancedLogic.filter(l => !nodeIds.has(l.nodeId)), ...snapshot.advancedLogic];
        }
        if (existing) updated++; else added++;
      }

      // Apply ALL accumulated changes in ONE setState (1 re-render)
      if (cloudData.length > 0) {
        useStore.setState({
          projects: frProjects,
          allNodes: frNodes,
          tokens: frTokens,
          groups: frGroups,
          pages: frPages,
          themes: frThemes,
          canvasStates: frCanvasStates,
          advancedLogic: frAdvancedLogic,
        });
      }

      // 5. Remove stale projects
      if (meta?.cloudProjectIds) {
        const serverIds = new Set(meta.cloudProjectIds as string[]);
        for (const e of cloudData) if (e.projectId) serverIds.add(e.projectId);
        const staleIds = useStore.getState().projects
          .filter(p => !p.isSample && !serverIds.has(p.id))
          .map(p => p.id);
        if (staleIds.length > 0) {
          console.log(`☁️ [ForceRefresh] Removing ${staleIds.length} stale project(s):`, staleIds);
          const staleSet = new Set(staleIds);
          const frStale = useStore.getState();
          useStore.setState({
            projects: frStale.projects.filter(p => !staleSet.has(p.id)),
            allNodes: frStale.allNodes.filter(n => !staleSet.has(n.projectId)),
            tokens: frStale.tokens.filter(t => !staleSet.has(t.projectId)),
            groups: frStale.groups.filter(g => !staleSet.has(g.projectId)),
            pages: frStale.pages.filter(p => !staleSet.has(p.projectId)),
            themes: frStale.themes.filter(t => !staleSet.has(t.projectId)),
            canvasStates: frStale.canvasStates.filter(cs => !staleSet.has(cs.projectId)),
          });
          for (const id of staleIds) delete lastSyncedAtMapRef.current[id];
        }
      }

      console.log(`☁️ ═══ FORCE CLOUD REFRESH DONE: +${added} added, ~${updated} updated ═══`);
      setCloudSyncStatus('synced');
    } catch (e) {
      console.log(`☁️ [ForceRefresh] ERROR: ${e}`);
      setCloudSyncStatus('error');
    } finally {
      const frs = useStore.getState();
      knownEntitiesRef.current = {
        allNodes: frs.allNodes, tokens: frs.tokens, groups: frs.groups,
        pages: frs.pages, themes: frs.themes, canvasStates: frs.canvasStates,
        advancedLogic: frs.advancedLogic,
      };
      setTimeout(() => { isLoadingCloudDataRef.current = false; setIsLoadingCloudData(false); }, 100);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    // Flush any pending sync before signing out (best-effort)
    try { await forceSyncAll(); } catch { /* ignore sync errors on signout */ }

    try {
      const supabase = getSupabaseClient();
      // Use { scope: 'local' } to clear only THIS domain's session.
      // The accounts.zeros.design login page independently handles stale
      // sessions by clearing them when redirect_url is present.
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.log(`Sign out network error (continuing): ${e}`);
    }

    // Clear ALL auth-related state and storage
    setAuthSession(null);
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem('0colors-auth-skipped');
    updateAccessToken(null);
    destroyCloudSync();

    // Clear Supabase session storage key explicitly
    // (signOut should do this, but be defensive)
    try {
      const sbKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (sbKey) localStorage.removeItem(sbKey);
    } catch { /* ignore */ }

    console.log('🔑 Signed out — all sessions revoked, storage cleared');
  }, []);

  const handleSkipAuth = useCallback(() => {
    setAuthChecking(false);
    setAuthSkipped(true);
    localStorage.setItem('0colors-auth-skipped', 'true');
    // User continues without auth — all projects are local
  }, []);

  // ── Auto-skip auth gate for first-time users ──
  useEffect(() => {
    // The URL hash tokens are already processed and cleaned up by useOAuthCallback
    // in App.tsx before this hook runs. If no session was established, auto-skip.
    if (!authChecking && !authSession && !authSkipped) {
      handleSkipAuth();
    }
  }, [authChecking, authSession, authSkipped, handleSkipAuth]);

  // Online/offline tracking for cloud sync indicator
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => { setIsOnline(false); setCloudSyncStatus('offline'); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ────────────────────────────────────────────────────
  // MANUAL SYNC HANDLER
  // ────────────────────────────────────────────────────
  const handleManualSync = useCallback(async () => {
    if (cloudSyncStatus === 'syncing') return;

    // Show spinner IMMEDIATELY so the user gets instant visual feedback.
    setCloudSyncStatus('syncing');

    // Safety timeout: reset indicator if sync hasn't resolved in 45 s.
    const safetyTimer = setTimeout(() => {
      setCloudSyncStatus((prev: any) =>
        prev === 'syncing' ? 'error' : prev,
      );
      setLastSyncError('Sync timed out — please try again');
    }, 45_000);

    // ── 1. Explicitly mark ALL cloud/template projects dirty ──
    const curProjects = useStore.getState().projects;
    for (const p of curProjects) {
      // Write-through handles sync via persistence middleware
    }

    // ── 2. Recompute computed tokens from REFS (always latest) ──
    try {
      const previousMap = computedTokensRef.current;
      const freshComputed = computeAllProjectTokens(
        curProjects,
        useStore.getState().allNodes,
        useStore.getState().tokens,
        useStore.getState().groups,
        useStore.getState().pages,
        useStore.getState().themes,
        useStore.getState().advancedLogic,
        Object.keys(previousMap).length > 0 ? previousMap : undefined,
      );
      computedTokensRef.current = freshComputed;
      try {
        localStorage.setItem('0colors-computed-tokens', JSON.stringify(freshComputed));
      } catch { /* ignore quota errors */ }
    } catch (err) {
      console.error('🧮 Pre-sync computed tokens refresh failed:', err);
    }

    // ── 3. Flush to server ──
    try {
      const success = await forceSyncAll();
      clearTimeout(safetyTimer);
      if (success) {
        setCloudSyncStatus((prev: any) =>
          prev === 'syncing' ? 'synced' : prev,
        );
        setLastSyncError(undefined);
      } else {
        if (!navigator.onLine) {
          setCloudSyncStatus('offline');
        } else {
          setCloudSyncStatus((prev: any) =>
            prev === 'syncing' ? 'dirty' : prev,
          );
        }
      }
    } catch (err) {
      clearTimeout(safetyTimer);
      console.error('☁️ Manual sync failed:', err);
      setCloudSyncStatus('error');
      setLastSyncError(String(err));
    }
  }, [cloudSyncStatus]);

  // ────────────────────────────────────────────────────
  // MEMOS
  // ────────────────────────────────────────────────────

  // Compute effective cloud sync status for active project
  const effectiveCloudSyncStatus = useMemo(() => {
    const activeProject = projects.find(p => p.id === activeProjectId);
    if (!activeProject || activeProject.isSample) return 'idle' as const;
    if (!isOnline) return 'offline' as const;
    // Write-through status: idle, syncing, synced, error
    if (cloudSyncStatus === 'dirty') return 'idle' as const; // 'dirty' deprecated
    if (cloudSyncStatus === 'local') return 'idle' as const; // 'local' deprecated
    return cloudSyncStatus;
  }, [projects, activeProjectId, isOnline, cloudSyncStatus]);

  const activeProjectLastSyncedAt = useMemo(() => {
    const activeProject = projects.find(p => p.id === activeProjectId);
    return activeProject?.lastSyncedAt;
  }, [projects, activeProjectId]);

  const cloudDirtyCount = useMemo(() => {
    return 0; // Write-through handles sync — no dirty tracking
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, cloudSyncStatus]);

  // Auto-transition from 'synced' → 'idle' after 3 seconds
  useEffect(() => {
    if (cloudSyncStatus === 'synced') {
      const t = setTimeout(() => setCloudSyncStatus('idle'), 3500);
      return () => clearTimeout(t);
    }
  }, [cloudSyncStatus]);

  // ────────────────────────────────────────────────────
  // RETURN
  // ────────────────────────────────────────────────────
  return {
    // Callbacks
    handleAuth,
    handleSignOut,
    handleSkipAuth,
    handleForceCloudRefresh,
    handleManualSync,
    // Memos
    effectiveCloudSyncStatus,
    activeProjectLastSyncedAt,
    cloudDirtyCount,
    // Refs
    authSessionRef,
    computedTokensRef,
    isLoadingCloudDataRef,
    lastSyncedAtMapRef,
    // Additional refs used by App.tsx & passed to child hooks
    viewingProjectsRef,
    communityLoadedRef,
    lastSyncedPathnameRef,
    activeProjectSlugRef,
    getProjectSnapshotRef,
    mountTimeRef,
  };
}
