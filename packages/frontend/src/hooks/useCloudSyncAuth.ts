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
import { useStore } from '../store';
import { useLocation } from 'react-router';

// ── Cloud sync & auth ──
import { getSupabaseClient } from '../utils/supabase/client';
import {
  initCloudSync,
  destroyCloudSync,
  updateAccessToken,
  markDirty,
  forceSyncNow,
  isDirty,
  hasDirtyProjects,
  getDirtyProjectIds,
  loadCloudProjects,
  getCloudMeta,
  loadPublicTemplates,
} from '../utils/supabase/cloud-sync';
import type { ProjectSnapshot } from '../utils/supabase/cloud-sync';
import { migrateSnapshot, CURRENT_SCHEMA_VERSION } from '../utils/migrations';
import { computeAllProjectTokens, type ProjectComputedTokens } from '../utils/computed-tokens';
import { slugify } from '../utils/slugify';

// Auth session key (same as in App.tsx)
const AUTH_SESSION_KEY = '0colors-auth-session';

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
    loadPublicTemplates().then(templates => {
      if (cancelled) return;
      clearTimeout(timeout);
      console.log(`📋 Loaded ${templates.length} cloud template(s) from backend`);
      setCloudTemplates(templates);
      setCloudTemplatesLoaded(true);
    });
    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  // ────────────────────────────────────────────────────
  // COMPUTED TOKENS — derived per-project, per-theme resolved tokens
  // ────────────────────────────────────────────────────
  useEffect(() => {
    if (isInitialLoad) return;

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
  // AUTH SESSION RESTORATION & CLOUD SYNC
  // ════════════════════════════════════════════════════

  // Restore auth session on mount
  useEffect(() => {
    let aborted = false; // Guard against React Strict Mode double-mount races

    const checkSession = async () => {
      try {
        const supabase = getSupabaseClient();

        // First try to get the cached session
        const { data: sessionData } = await supabase.auth.getSession();
        if (aborted) return;

        if (sessionData?.session) {
          // We have a cached session — refresh it to ensure the access token is fresh.
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (aborted) return;

          if (refreshError || !refreshData?.session?.access_token) {
            console.log(`🔑 Session refresh failed: ${refreshError?.message || 'no session returned'}`);
            // Fall back to cached session — preserve isAdmin/isTemplateAdmin from previous load to avoid blink
            setAuthSession((prev) => {
              const session = {
                accessToken: sessionData.session.access_token,
                userId: sessionData.session.user.id,
                email: sessionData.session.user.email || '',
                name: sessionData.session.user.user_metadata?.name || sessionData.session.user.email?.split('@')[0] || '',
                isAdmin: prev?.isAdmin,
                isTemplateAdmin: prev?.isTemplateAdmin,
              };
              localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
              return session;
            });
          } else {
            // Use the refreshed session — preserve isAdmin/isTemplateAdmin from cache to avoid blink
            console.log('🔑 Session refreshed successfully');
            setAuthSession((prev) => {
              const session = {
                accessToken: refreshData.session.access_token,
                userId: refreshData.session.user.id,
                email: refreshData.session.user.email || '',
                name: refreshData.session.user.user_metadata?.name || refreshData.session.user.email?.split('@')[0] || '',
                isAdmin: prev?.isAdmin,
                isTemplateAdmin: prev?.isTemplateAdmin,
              };
              localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
              return session;
            });
          }
        } else {
          // No active session
          console.log('🔑 No active Supabase session');
        }
      } catch (e) {
        console.log(`Auth session check error (may be offline): ${e}`);
      } finally {
        if (!aborted) setAuthChecking(false);
      }
    };
    checkSession();

    // Listen for auth state changes (e.g., sign-out from another tab)
    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const supabase = getSupabaseClient();
      const result = supabase.auth.onAuthStateChange((event: string, session: any) => {
        if (event === 'TOKEN_REFRESHED' && session?.access_token) {
          console.log('🔑 Token refreshed — updating session');
          setAuthSession((prev: any) => {
            if (!prev) return prev;
            const updated = { ...prev, accessToken: session.access_token };
            localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(updated));
            updateAccessToken(session.access_token);
            return updated;
          });
        } else if (event === 'SIGNED_IN' && session?.access_token) {
          // Handles: email verification callback, password reset callback,
          // or any OAuth/magic-link redirect that lands with tokens in the URL hash.
          console.log('🔑 SIGNED_IN event — establishing session from auth callback');
          const newSession = {
            accessToken: session.access_token,
            userId: session.user?.id,
            email: session.user?.email || '',
            name: session.user?.user_metadata?.name || session.user?.email?.split('@')[0] || '',
          };
          setAuthSession(newSession);
          setAuthSkipped(false);
          localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(newSession));
          localStorage.removeItem('0colors-auth-skipped');
          updateAccessToken(session.access_token);
          // Clean up the URL hash so #access_token=... doesn't linger
          if (window.location.hash && window.location.hash.includes('access_token')) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        } else if (event === 'SIGNED_OUT') {
          console.log('🔑 Signed out via auth state change');
          setAuthSession(null);
          localStorage.removeItem(AUTH_SESSION_KEY);
          updateAccessToken(null);
          destroyCloudSync();
        }
      });
      subscription = result.data?.subscription ?? null;
    } catch (e) {
      console.log(`Auth state listener setup error (non-fatal): ${e}`);
    }

    // Manual token refresh timer (since autoRefreshToken is disabled to prevent
    // unhandled rejections from the SDK's internal refresh mechanism).
    // Refresh every 10 minutes — Supabase JWTs typically last 1 hour.
    const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
    const refreshTimer = setInterval(async () => {
      if (aborted) return;
      try {
        const sb = getSupabaseClient();
        const { data, error } = await sb.auth.refreshSession();
        if (aborted) return;
        if (data?.session?.access_token) {
          setAuthSession((prev: any) => {
            if (!prev) return prev;
            const updated = { ...prev, accessToken: data.session!.access_token };
            localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(updated));
            updateAccessToken(data.session!.access_token);
            return updated;
          });
          console.log('🔑 Manual token refresh succeeded');
        } else if (error) {
          console.log(`🔑 Manual token refresh failed (non-fatal): ${error.message}`);
        }
      } catch (e) {
        console.log(`🔑 Manual token refresh error (non-fatal): ${e}`);
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      aborted = true;
      subscription?.unsubscribe();
      clearInterval(refreshTimer);
    };
  }, []);

  // ────────────────────────────────────────────────────
  // getProjectSnapshot — always reads from REFS (latest state)
  // ────────────────────────────────────────────────────
  getProjectSnapshotRef.current = (projectId: string): ProjectSnapshot | null => {
    const project = useStore.getState().projects.find(p => p.id === projectId);
    if (!project || !(project.isCloud || project.isTemplate)) return null;

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
    });

    // Load cloud project data on first auth
    const loadCloudData = async () => {
      try {
        // ── CRITICAL: Flush dirty local data before fetching cloud state ──
        if (hasDirtyProjects()) {
          console.log(`☁️ [loadCloudData] Flushing ${getDirtyProjectIds().length} dirty project(s) before fetching cloud data…`);
          await forceSyncNow().catch((e) => console.log('☁️ [loadCloudData] Pre-load flush failed:', e));
          if (loadCancelled) return;
        }

        // ── Step 1: Fetch cloud metadata (includes admin & template admin status) ──
        const cloudMeta = await getCloudMeta(authSession.accessToken).catch((e: any) => {
          console.log(`☁️ getCloudMeta failed: ${e}`);
          return null;
        });
        if (loadCancelled) return;
        console.log(`☁️ Cloud meta result:`, JSON.stringify(cloudMeta));
        if (cloudMeta) {
          const isAdmin = cloudMeta.isAdmin ?? false;
          const isTemplateAdmin = cloudMeta.isTemplateAdmin ?? false;
          console.log(`☁️ Admin status: isAdmin=${isAdmin}, isTemplateAdmin=${isTemplateAdmin}`);
          setAuthSession(prev => prev ? { ...prev, isAdmin, isTemplateAdmin } : prev);
          const updatedSession = { ...authSession, isAdmin, isTemplateAdmin };
          localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(updatedSession));
          if (isAdmin) {
            console.log(`[ADMIN] Logged in as admin${isTemplateAdmin ? ' + template admin' : ''} - unlimited cloud projects`);
          }
        }

        // ── Step 2: Load cloud project snapshots ──
        const cloudData = await loadCloudProjects(authSession.accessToken).catch((e: any) => {
          console.log(`☁️ loadCloudProjects FAILED: ${e}`);
          return [] as any[];
        });
        if (loadCancelled) return;

        // ── Enhanced diagnostic logging ──
        const localCloudProjects = useStore.getState().projects.filter(p => p.isCloud || p.isTemplate);
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
          isLoadingCloudDataRef.current = true;

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

            // ── KEY FIX: Always merge if project doesn't exist locally ──
            const projectIsDirty = existingProject && isDirty(projectId);
            const shouldMerge = !existingProject || (remoteSyncedAt > localSyncedAt && !projectIsDirty);

            if (projectIsDirty && remoteSyncedAt > localSyncedAt) {
              console.log(`☁️ SKIPPING cloud overwrite for dirty project ${projectId} — local has unsaved changes (remote=${remoteSyncedAt}, local=${localSyncedAt})`);
            }

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
            if ((p.isCloud || p.isTemplate) && !serverProjectIds.has(p.id)) {
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
        // Defer the reset so the flag is still true when React processes the
        // batched state updates and fires the markDirty effect.
        setTimeout(() => { isLoadingCloudDataRef.current = false; }, 100);
      }
    };

    loadCloudData();

    return () => { loadCancelled = true; isLoadingCloudDataRef.current = false; destroyCloudSync(); };
  }, [authSession?.accessToken]);

  // ────────────────────────────────────────────────────
  // FULL CLOUD RECONCILIATION (on projects page visit)
  // ────────────────────────────────────────────────────
  useEffect(() => {
    if (!viewingProjects || !authSession) return;
    // Skip reconciliation within the first 5s of mount — loadCloudData already handles the initial load.
    if (Date.now() - mountTimeRef.current < 5000) return;

    let cancelled = false;
    const fullReconcile = async () => {
      try {
        // ── CRITICAL: Flush dirty local data to cloud BEFORE downloading ──
        if (hasDirtyProjects()) {
          console.log(`☁️ [Reconcile] Flushing ${getDirtyProjectIds().length} dirty project(s) before downloading…`);
          await forceSyncNow().catch((e) => console.log('☁️ [Reconcile] Pre-reconcile flush failed:', e));
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
        isLoadingCloudDataRef.current = true;
        const serverIds = new Set(meta.cloudProjectIds as string[]);
        const localCloudCount = useStore.getState().projects.filter(p => p.isCloud || p.isTemplate).length;
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
            if (isDirty(projectId)) {
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
          if ((p.isCloud || p.isTemplate) && !serverIds.has(p.id)) {
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
        setTimeout(() => { isLoadingCloudDataRef.current = false; }, 100);
      }
    };
    fullReconcile();
    return () => { cancelled = true; isLoadingCloudDataRef.current = false; };
  }, [viewingProjects, authSession]);

  // ────────────────────────────────────────────────────
  // MARK DIRTY — track cloud projects with local changes
  // ────────────────────────────────────────────────────
  useEffect(() => {
    if (isInitialLoad || isImporting || !authSession) return;
    // ── KEY FIX: Skip markDirty while merging cloud data into local state ──
    if (isLoadingCloudDataRef.current) return;

    const cloudProjectIds = projects.filter(p => p.isCloud || p.isTemplate).map(p => p.id);
    for (const pid of cloudProjectIds) {
      markDirty(pid);
    }
    // Update status to show unsaved changes (only if not currently syncing)
    if (cloudProjectIds.length > 0 && cloudSyncStatus !== 'syncing') {
      setCloudSyncStatus('dirty');
    }
  }, [allNodes, tokens, groups, pages, themes, canvasStates, advancedLogic, isInitialLoad, isImporting, authSession]);

  // ────────────────────────────────────────────────────
  // AUTH CALLBACKS
  // ────────────────────────────────────────────────────
  const handleAuth = useCallback((session: { accessToken: string; userId: string; email: string; name: string }) => {
    setAuthSession(session);
    setAuthSkipped(false);
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
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
      if (hasDirtyProjects()) {
        console.log(`☁️ [ForceRefresh] Flushing ${getDirtyProjectIds().length} dirty project(s) before refresh…`);
        await forceSyncNow().catch((e) => console.log('☁️ [ForceRefresh] Pre-refresh flush failed:', e));
      }

      // 1. Clear ALL timestamp caches
      console.log(`☁️ [ForceRefresh] Clearing lastSyncedAtMapRef (had ${Object.keys(lastSyncedAtMapRef.current).length} entries)`);
      lastSyncedAtMapRef.current = {};

      // 2. Also clear lastSyncedAt on all local projects
      setProjects(prev => prev.map(p => (p.isCloud || p.isTemplate) ? { ...p, lastSyncedAt: 0 } : p));

      // 3. Fetch fresh data from server
      isLoadingCloudDataRef.current = true;
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
          .filter(p => (p.isCloud || p.isTemplate) && !serverIds.has(p.id))
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
      setTimeout(() => { isLoadingCloudDataRef.current = false; }, 100);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    // Flush any pending sync before signing out (best-effort)
    try { await forceSyncNow(); } catch { /* ignore sync errors on signout */ }

    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.log(`Sign out network error (continuing): ${e}`);
    }
    setAuthSession(null);
    localStorage.removeItem(AUTH_SESSION_KEY);
    updateAccessToken(null);
    destroyCloudSync();
  }, []);

  const handleSkipAuth = useCallback(() => {
    setAuthChecking(false);
    setAuthSkipped(true);
    localStorage.setItem('0colors-auth-skipped', 'true');
    // User continues without auth — all projects are local
  }, []);

  // ── Auto-skip auth gate for first-time users ──
  useEffect(() => {
    // Don't auto-skip if Supabase is still processing tokens from the URL hash
    // (redirect back from accounts.zeros.design). The SIGNED_IN event will fire shortly.
    const hashHasTokens =
      window.location.hash && window.location.hash.includes("access_token");
    if (!authChecking && !authSession && !authSkipped && !hashHasTokens) {
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
      if (p.isCloud || p.isTemplate) markDirty(p.id);
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
      const success = await forceSyncNow();
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
    if (!activeProject) return 'local' as const;
    const isCloud = activeProject.isCloud || activeProject.isTemplate;
    if (!isCloud) return 'local' as const;
    if (!isOnline) return 'offline' as const;
    // Use tracked status
    return cloudSyncStatus;
  }, [projects, activeProjectId, isOnline, cloudSyncStatus]);

  const activeProjectLastSyncedAt = useMemo(() => {
    const activeProject = projects.find(p => p.id === activeProjectId);
    return activeProject?.lastSyncedAt;
  }, [projects, activeProjectId]);

  const cloudDirtyCount = useMemo(() => {
    return projects.filter(p => (p.isCloud || p.isTemplate)).length;
  }, [projects]);

  // Auto-transition from 'synced' → 'idle' after 3 seconds
  useEffect(() => {
    if (cloudSyncStatus === 'synced') {
      const t = setTimeout(() => setCloudSyncStatus('idle'), 3500);
      return () => clearTimeout(t);
    }
  }, [cloudSyncStatus]);

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
