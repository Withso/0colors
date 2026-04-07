// AI Chat logic extracted from App.tsx:
// - aiConversations cloud save/load effects (debounced)
// - AI settings cloud save/load effects
// - beforeunload handler for pending AI data
// - handleAIConversationsChange useCallback
// - handleAISettingsSaved useCallback
// - handleAIChatDockChange useCallback
// - aiProjectContext useMemo
// - aiMutationContext useMemo
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store';
import {
  Conversation, loadCloudConversations, saveCloudConversations,
  AISettings, ContextToggles,
  saveLocalConversations, mergeConversations, trimConversations,
  loadAISettings, saveAISettings, loadContextTier, saveContextTier, loadContextToggles, saveContextToggles,
  loadCloudSettingsBundle, saveCloudSettingsBundle, buildCloudSettingsBundle, mergeSettingsBundles,
  setLocalSettingsUpdatedAt,
} from '../utils/ai-provider';
import type { ContextTier } from '../utils/ai-context-manager';
import { buildProjectContext } from '../utils/ai-project-context';
import type { MutationContext } from '../utils/ai-build-executor';
import { SERVER_BASE } from '../utils/supabase/client';

export function useAIChat(deps: {
  createNodeProgrammatic: MutationContext['createNodeProgrammatic'];
  updateNode: MutationContext['updateNode'];
  deleteNode: MutationContext['deleteNode'];
  addToken: MutationContext['addToken'];
  updateToken: MutationContext['updateToken'];
  deleteToken: MutationContext['deleteToken'];
  assignTokenToNode: MutationContext['assignTokenToNode'];
  createThemeProgrammatic: MutationContext['createThemeProgrammatic'];
  createPageProgrammatic: MutationContext['createPageProgrammatic'];
}) {
  const {
    createNodeProgrammatic, updateNode, deleteNode,
    addToken, updateToken, deleteToken, assignTokenToNode,
    createThemeProgrammatic, createPageProgrammatic,
  } = deps;

  const authSession = useStore(s => s.authSession);
  const aiConversations = useStore(s => s.aiConversations);
  const setAIConversations = useStore(s => s.setAIConversations);
  const aiChatDocked = useStore(s => s.aiChatDocked);
  const setAIChatDocked = useStore(s => s.setAIChatDocked);

  const projects = useStore(s => s.projects);
  const activeProjectId = useStore(s => s.activeProjectId);
  const pages = useStore(s => s.pages);
  const activePageId = useStore(s => s.activePageId);
  const themes = useStore(s => s.themes);
  const activeThemeId = useStore(s => s.activeThemeId);
  const allNodes = useStore(s => s.allNodes);
  const tokens = useStore(s => s.tokens);
  const groups = useStore(s => s.groups);
  const advancedLogic = useStore(s => s.advancedLogic);
  const setAdvancedLogic = useStore(s => s.setAdvancedLogic);

  // ── Refs ──
  const aiConvSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiConvLoadedRef = useRef(false);
  const aiConvPendingRef = useRef<Conversation[] | null>(null);
  const aiSettingsPendingRef = useRef<string | null>(null);
  const aiSettingsLoadedRef = useRef(false);
  const aiSettingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── handleAIChatDockChange ──
  const handleAIChatDockChange = useCallback((docked: boolean) => {
    setAIChatDocked(docked);
    try { localStorage.setItem('0colors-ai-chat-docked', String(docked)); } catch { }
  }, []);

  // ── Load conversations from cloud & merge with local ──
  useEffect(() => {
    if (!authSession?.accessToken || aiConvLoadedRef.current) return;
    aiConvLoadedRef.current = true;
    loadCloudConversations(authSession.accessToken).then(cloudConvs => {
      if (cloudConvs && cloudConvs.length > 0) {
        setAIConversations(prev => {
          const merged = mergeConversations(prev, cloudConvs);
          saveLocalConversations(merged);
          console.log(`[AI] Merged ${prev.length} local + ${cloudConvs.length} cloud → ${merged.length} conversations`);
          return merged;
        });
      }
    });
  }, [authSession?.accessToken]);

  // ── Flush pending cloud save on page unload ──
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (aiConvSaveTimerRef.current) {
        clearTimeout(aiConvSaveTimerRef.current);
        aiConvSaveTimerRef.current = null;
      }
      if (aiConvPendingRef.current && authSession?.accessToken) {
        const payload = JSON.stringify({ conversations: trimConversations(aiConvPendingRef.current) });
        try {
          if (SERVER_BASE) {
            fetch(`${SERVER_BASE}/ai-conversations`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authSession.accessToken}`,
              },
              body: payload,
              keepalive: true,
            }).catch(() => { });
          }
        } catch { }
        aiConvPendingRef.current = null;
      }
      if (aiSettingsSaveTimerRef.current) {
        clearTimeout(aiSettingsSaveTimerRef.current);
        aiSettingsSaveTimerRef.current = null;
      }
      if (aiSettingsPendingRef.current && authSession?.accessToken) {
        try {
          if (SERVER_BASE) {
            fetch(`${SERVER_BASE}/ai-settings`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authSession.accessToken}`,
              },
              body: JSON.stringify({ settings: JSON.parse(aiSettingsPendingRef.current) }),
              keepalive: true,
            }).catch(() => { });
          }
        } catch { }
        aiSettingsPendingRef.current = null;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [authSession?.accessToken]);

  // ── Save conversations on every change ──
  const handleAIConversationsChange = useCallback((newConvs: Conversation[] | ((prev: Conversation[]) => Conversation[])) => {
    setAIConversations(prev => {
      const resolved = typeof newConvs === 'function' ? newConvs(prev) : newConvs;
      const trimmed = trimConversations(resolved);

      saveLocalConversations(trimmed);

      if (authSession?.accessToken) {
        aiConvPendingRef.current = trimmed;
        if (aiConvSaveTimerRef.current) clearTimeout(aiConvSaveTimerRef.current);
        aiConvSaveTimerRef.current = setTimeout(() => {
          saveCloudConversations(authSession.accessToken, trimmed).then(ok => {
            if (ok) {
              console.log(`[AI] Cloud saved ${trimmed.length} conversations`);
              aiConvPendingRef.current = null;
            } else {
              console.log('[AI] Cloud save failed — data is safe in localStorage');
            }
          });
        }, 2000);
      }
      return trimmed;
    });
  }, [authSession?.accessToken]);

  // ── Load cloud settings & merge with local on auth ──
  useEffect(() => {
    if (!authSession?.accessToken || !authSession?.userId || aiSettingsLoadedRef.current) return;
    aiSettingsLoadedRef.current = true;
    loadCloudSettingsBundle(authSession.accessToken).then(async (cloudBundle) => {
      if (!cloudBundle || !cloudBundle.settings) return;
      try {
        const localSettings = loadAISettings();
        const localTier = loadContextTier();
        const localToggles = loadContextToggles();
        const merged = await mergeSettingsBundles(localSettings, localTier, localToggles, cloudBundle, authSession.userId);
        if (merged.changed) {
          saveAISettings(merged.settings);
          saveContextTier(merged.contextTier);
          saveContextToggles(merged.contextToggles);
          console.log(`[AI] Cloud settings merged — active: ${merged.settings.activeModel.serviceId}/${merged.settings.activeModel.modelId}, tier: ${merged.contextTier}`);
        } else {
          console.log('[AI] Local settings are up to date (cloud not newer)');
        }
      } catch (e: any) {
        console.log(`[AI] Settings merge error: ${e?.message}`);
      }
    });
  }, [authSession?.accessToken, authSession?.userId]);

  // ── Save AI settings to cloud (encrypted) ──
  const handleAISettingsSaved = useCallback((settings: AISettings, contextTier?: ContextTier, contextToggles?: ContextToggles) => {
    setLocalSettingsUpdatedAt(Date.now());
    if (authSession?.accessToken && authSession?.userId) {
      if (aiSettingsSaveTimerRef.current) clearTimeout(aiSettingsSaveTimerRef.current);
      aiSettingsSaveTimerRef.current = setTimeout(async () => {
        try {
          const tier = contextTier || loadContextTier();
          const toggles = contextToggles || loadContextToggles();
          const bundle = await buildCloudSettingsBundle(settings, tier, toggles, authSession.userId);
          aiSettingsPendingRef.current = JSON.stringify(bundle);
          const ok = await saveCloudSettingsBundle(authSession.accessToken, bundle);
          if (ok) {
            console.log('[AI] Settings synced to cloud (encrypted)');
            aiSettingsPendingRef.current = null;
          } else {
            console.log('[AI] Settings cloud save failed — safe in localStorage');
          }
        } catch (e: any) {
          console.log(`[AI] Settings cloud save error: ${e?.message}`);
        }
      }, 1000);
    }
  }, [authSession?.accessToken, authSession?.userId]);

  // ── Build raw project context ──
  const aiProjectContext = useMemo(() => {
    return buildProjectContext({
      projects, activeProjectId, pages, activePageId,
      themes, activeThemeId, allNodes, tokens, groups, advancedLogic,
    });
  }, [projects, activeProjectId, pages, activePageId, themes, activeThemeId, allNodes, tokens, groups, advancedLogic]);

  // ── Build Mode: mutation context for AI ──
  const aiMutationContext = useMemo((): MutationContext => ({
    createNodeProgrammatic,
    updateNode,
    deleteNode,
    addToken,
    updateToken,
    deleteToken,
    assignTokenToNode,
    createThemeProgrammatic,
    createPageProgrammatic,
    setAdvancedLogic: (logic) => setAdvancedLogic(logic),
    getCurrentProjectContext: () => buildProjectContext({
      projects, activeProjectId, pages, activePageId,
      themes, activeThemeId, allNodes, tokens, groups, advancedLogic,
    }),
    allNodes,
    tokens,
    groups,
    themes,
    pages,
    advancedLogic,
    activeProjectId,
    activePageId,
    activeThemeId,
  }), [
    createNodeProgrammatic, updateNode, deleteNode,
    addToken, updateToken, deleteToken, assignTokenToNode,
    createThemeProgrammatic, createPageProgrammatic,
    projects, activeProjectId, pages, activePageId,
    themes, activeThemeId, allNodes, tokens, groups, advancedLogic,
  ]);

  return {
    aiConversations,
    handleAIConversationsChange,
    handleAISettingsSaved,
    handleAIChatDockChange,
    aiProjectContext,
    aiMutationContext,
  };
}
