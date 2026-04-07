// Dev Mode logic extracted from App.tsx:
// - devConfigs persistence effects (localStorage + cloud save)
// - devConfig cloud load effect
// - Webhook input polling effect (5s interval)
// - activeDevConfig useMemo
// - updateDevConfig useCallback
// - handleDevModeRun useCallback
// - handleDevModeTestWebhook useCallback
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store';
import type { DevConfig } from '../types';
import { createDefaultDevConfig } from '../types';
import { getSupabaseClient, SERVER_BASE } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { decryptPAT } from '../utils/crypto';
import { rgbToHsl, oklchToHsl } from '../utils/color-conversions';
import { hctToRgb } from '../utils/hct-utils';
import { generateCSSVariables, generateDTCGJSON, generateTailwindConfig, generateFigmaVariablesJSON } from '../utils/tokenFormatters';
import { toast } from 'sonner';

export function useDevMode() {
  const devConfigs = useStore(s => s.devConfigs);
  const setDevConfigs = useStore(s => s.setDevConfigs);
  const allNodes = useStore(s => s.allNodes);
  const tokens = useStore(s => s.tokens);
  const groups = useStore(s => s.groups);
  const themes = useStore(s => s.themes);
  const activeThemeId = useStore(s => s.activeThemeId);
  const activeProjectId = useStore(s => s.activeProjectId);
  const projects = useStore(s => s.projects);
  const advancedLogic = useStore(s => s.advancedLogic);
  const authSession = useStore(s => s.authSession);

  // Get/set dev config for active project
  const activeDevConfig = useMemo(() => {
    return devConfigs[activeProjectId] || createDefaultDevConfig();
  }, [devConfigs, activeProjectId]);

  const updateDevConfig = useCallback((config: DevConfig) => {
    setDevConfigs(prev => {
      const next = { ...prev, [activeProjectId]: config };
      localStorage.setItem('0colors-dev-configs', JSON.stringify(next));
      return next;
    });
  }, [activeProjectId]);

  // Debounced cloud save for devConfig
  const devConfigSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!authSession || !activeDevConfig) return;
    const project = projects.find(p => p.id === activeProjectId);
    if (!project?.isCloud) return;

    if (devConfigSaveTimerRef.current) clearTimeout(devConfigSaveTimerRef.current);
    devConfigSaveTimerRef.current = setTimeout(async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        await fetch(`${SERVER_BASE}/dev/save-config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': session.access_token,
          },
          body: JSON.stringify({ projectId: activeProjectId, devConfig: activeDevConfig }),
        });
      } catch (e) {
        console.error('[DevMode] Cloud save error:', e);
      }
    }, 3000); // 3s debounce

    return () => {
      if (devConfigSaveTimerRef.current) clearTimeout(devConfigSaveTimerRef.current);
    };
  }, [activeDevConfig, activeProjectId, authSession, projects]);

  // Load devConfig from cloud when active cloud project changes
  useEffect(() => {
    if (!authSession) return;
    const project = projects.find(p => p.id === activeProjectId);
    if (!project?.isCloud) return;

    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch(`${SERVER_BASE}/dev/load-config/${activeProjectId}`, {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': session.access_token,
          },
        });
        const data = await res.json();
        if (data.devConfig) {
          setDevConfigs(prev => {
            const next = { ...prev, [activeProjectId]: data.devConfig };
            localStorage.setItem('0colors-dev-configs', JSON.stringify(next));
            return next;
          });
        }
      } catch (e) {
        // Silently fail — local config is the fallback
      }
    })();
  }, [authSession, activeProjectId, projects]);

  // ── Webhook Input Polling ──
  useEffect(() => {
    if (!authSession || !activeDevConfig?.webhookEnabled) return;
    const hasWebhookTargets = activeDevConfig.webhookTargetNodeId ||
      allNodes.some(n => n.projectId === activeProjectId && n.isWebhookInput);
    if (!hasWebhookTargets) return;
    const project = projects.find(p => p.id === activeProjectId);
    if (!project?.isCloud) return;

    const POLL_INTERVAL = 5000; // 5 seconds
    let running = true;

    const pollPending = async () => {
      if (!running) return;
      try {
        const supabase = getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const headers = {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-User-Token': session.access_token,
        };

        const res = await fetch(`${SERVER_BASE}/webhook-pending/${activeProjectId}`, { headers });
        const data = await res.json();

        if (data.pending && data.pending.value) {
          const { value, format, targetNodeId } = data.pending;
          const nodeId = targetNodeId || activeDevConfig.webhookTargetNodeId;
          const targetNode = useStore.getState().allNodes.find(n => n.id === nodeId);

          if (targetNode) {
            let parsedHsl: { h: number; s: number; l: number } | null = null;
            try {
              if (format === 'hex' && typeof value === 'string') {
                const hex = value.replace('#', '');
                let r = 0, g = 0, b = 0;
                if (hex.length === 6 || hex.length === 8) {
                  r = parseInt(hex.substring(0, 2), 16);
                  g = parseInt(hex.substring(2, 4), 16);
                  b = parseInt(hex.substring(4, 6), 16);
                }
                parsedHsl = rgbToHsl(r, g, b);
              } else if (format === 'hsl') {
                const obj = typeof value === 'string' ? JSON.parse(value) : value;
                parsedHsl = {
                  h: obj.h ?? obj.hue ?? 0,
                  s: obj.s ?? obj.saturation ?? 0,
                  l: obj.l ?? obj.lightness ?? 50,
                };
              } else if (format === 'rgb') {
                const obj = typeof value === 'string' ? JSON.parse(value) : value;
                parsedHsl = rgbToHsl(obj.r ?? obj.red ?? 0, obj.g ?? obj.green ?? 0, obj.b ?? obj.blue ?? 0);
              } else if (format === 'oklch') {
                const obj = typeof value === 'string' ? JSON.parse(value) : value;
                const oL = obj.l ?? obj.lightness ?? 50;
                const oC = obj.c ?? obj.chroma ?? 0;
                const oH = obj.h ?? obj.hue ?? 0;
                parsedHsl = oklchToHsl(oL, oC, oH);
              } else if (format === 'hct') {
                const obj = typeof value === 'string' ? JSON.parse(value) : value;
                const rgb = hctToRgb(obj.h ?? obj.hue ?? 0, obj.c ?? obj.chroma ?? 0, obj.t ?? obj.tone ?? 50);
                parsedHsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
              }
            } catch (e) {
              console.log(`[Webhook] Failed to parse ${format} value:`, e);
            }
            if (parsedHsl) {
              window.dispatchEvent(new CustomEvent('devModeWebhookApply', {
                detail: { nodeId, hue: parsedHsl.h, saturation: parsedHsl.s, lightness: parsedHsl.l }
              }));
            }
            toast.info(`Webhook received: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
          }

          // Clear the pending trigger
          await fetch(`${SERVER_BASE}/webhook-clear/${activeProjectId}`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
          });
        }
      } catch (e) {
        // Silently ignore polling errors
      }
    };

    const timer = setInterval(pollPending, POLL_INTERVAL);
    pollPending(); // Check immediately

    return () => {
      running = false;
      clearInterval(timer);
    };
  }, [authSession, activeDevConfig?.webhookEnabled, activeDevConfig?.webhookTargetNodeId, activeProjectId, projects, allNodes]);

  // ── handleDevModeRun ──
  const handleDevModeRun = useCallback(async () => {
    const config = devConfigs[activeProjectId];
    if (!config) {
      toast.error('No Dev Mode config found for this project');
      return;
    }

    try {
      const projectTokens = tokens.filter(t => t.projectId === activeProjectId);
      const projectNodes = allNodes.filter(n => n.projectId === activeProjectId);
      const projectGroups = groups.filter(g => g.projectId === activeProjectId);
      const projectThemes = themes.filter(t => t.projectId === activeProjectId);
      const primaryTheme = projectThemes.find(t => t.isPrimary);
      const primaryThemeId = primaryTheme?.id || activeThemeId;

      const themesToExport = config.outputTheme
        ? projectThemes.filter(t => t.id === config.outputTheme)
        : projectThemes;

      const outputs: Record<string, string> = {};
      for (const theme of themesToExport) {
        let output = '';
        const themeId = theme.id;
        switch (config.outputFormat) {
          case 'css':
            output = generateCSSVariables(projectTokens, projectGroups, projectNodes, themeId, undefined, primaryThemeId, projectTokens, projectNodes, advancedLogic);
            break;
          case 'dtcg':
            output = generateDTCGJSON(projectTokens, projectGroups, projectNodes, themeId, undefined, primaryThemeId, projectTokens, projectNodes, advancedLogic);
            break;
          case 'tailwind':
            output = generateTailwindConfig(projectTokens, projectGroups, projectNodes, themeId, undefined, primaryThemeId, projectTokens, projectNodes, advancedLogic);
            break;
          case 'figma':
            output = generateFigmaVariablesJSON(projectTokens, projectGroups, projectNodes, projects.find(p => p.id === activeProjectId)?.name || 'Design Tokens', themeId, primaryThemeId, projectTokens, projectNodes, advancedLogic);
            break;
        }
        outputs[theme.name || theme.id] = output;
      }

      const combinedOutput = Object.entries(outputs).length === 1
        ? Object.values(outputs)[0]
        : Object.entries(outputs).map(([name, out]) => `/* Theme: ${name} */\n${out}`).join('\n\n');

      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      if (!authToken) {
        toast.error('Not authenticated. Sign in to use Dev Mode.');
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
        'X-User-Token': authToken,
      };

      let hasError = false;

      // 1. Save cached output for Pull API
      if (config.pullApiEnabled) {
        try {
          await fetch(`${SERVER_BASE}/dev/save-output`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ projectId: activeProjectId, format: config.outputFormat, output: combinedOutput }),
          });
        } catch (e: any) {
          console.error('[DevMode] Save output error:', e);
        }
      }

      // 2. Push to GitHub
      if (config.githubEnabled && config.githubRepo && config.githubPath && config.githubPATEncrypted) {
        try {
          const userId = authSession?.userId;
          let plainPAT = '';
          if (userId) {
            plainPAT = await decryptPAT(config.githubPATEncrypted, userId);
          }
          if (!plainPAT) {
            hasError = true;
            console.error('[DevMode] Failed to decrypt GitHub PAT — re-enter your token');
            toast.error('Failed to decrypt GitHub PAT. Please re-enter your token.');
          } else {
            const res = await fetch(`${SERVER_BASE}/dev/github-push`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                owner: config.githubRepo.includes('/') ? config.githubRepo.split('/')[0] : '',
                repo: config.githubRepo.includes('/') ? config.githubRepo.split('/')[1] : config.githubRepo,
                path: config.githubPath,
                branch: config.githubBranch || 'main',
                content: btoa(unescape(encodeURIComponent(combinedOutput))),
                message: `Update tokens via 0colors [${config.outputFormat}]`,
                pat: plainPAT,
              }),
            });
            const result = await res.json();
            if (!result.success) {
              hasError = true;
              console.error('[DevMode] GitHub push failed:', result);
            }
          }
        } catch (e: any) {
          hasError = true;
          console.error('[DevMode] GitHub push error:', e);
        }
      }

      // 3. Push to webhook output
      if (config.webhookOutputEnabled && config.webhookOutputUrl) {
        try {
          const res = await fetch(`${SERVER_BASE}/dev/webhook-push`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              url: config.webhookOutputUrl,
              payload: { format: config.outputFormat, tokens: combinedOutput, timestamp: Date.now(), projectId: activeProjectId },
              headers: config.webhookOutputHeaders,
            }),
          });
          const result = await res.json();
          if (!result.success) {
            hasError = true;
            console.error('[DevMode] Webhook push failed:', result);
          }
        } catch (e: any) {
          hasError = true;
          console.error('[DevMode] Webhook push error:', e);
        }
      }

      // Update run metadata
      updateDevConfig({
        ...config,
        lastRunAt: Date.now(),
        lastRunStatus: hasError ? 'error' : 'success',
        lastRunError: hasError ? 'One or more destinations failed. Check console.' : null,
      });

      if (hasError) {
        toast.error('Pipeline completed with errors');
      } else {
        const destinations = [
          config.pullApiEnabled && 'Pull API',
          config.githubEnabled && 'GitHub',
          config.webhookOutputEnabled && 'Webhook',
        ].filter(Boolean);
        toast.success(`Tokens pushed to ${destinations.join(', ') || 'cache'}`);
      }
    } catch (e: any) {
      console.error('[DevMode] Run error:', e);
      toast.error(`Dev Mode run failed: ${e?.message}`);
      updateDevConfig({
        ...devConfigs[activeProjectId],
        lastRunAt: Date.now(),
        lastRunStatus: 'error',
        lastRunError: e?.message || 'Unknown error',
      });
    }
  }, [devConfigs, activeProjectId, tokens, allNodes, groups, themes, activeThemeId, advancedLogic, projects, updateDevConfig, authSession]);

  const handleDevModeTestWebhook = useCallback(async () => {
    const config = devConfigs[activeProjectId];
    if (!config?.webhookEnabled) {
      toast.error('Enable webhook input first');
      return;
    }
    if (!config.webhookTargetNodeId) {
      toast.error('Select a target node first');
      return;
    }

    try {
      const res = await fetch(`${SERVER_BASE}/webhook/${activeProjectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': config.webhookSecret,
        },
        body: JSON.stringify({ value: '#FF5500', format: 'hex' }),
      });
      const result = await res.json();
      if (result.ok) {
        toast.success('Test webhook sent successfully');
      } else {
        toast.error(`Test failed: ${result.error}`);
      }
    } catch (e: any) {
      toast.error(`Test webhook error: ${e?.message}`);
    }
  }, [devConfigs, activeProjectId]);

  return {
    activeDevConfig,
    updateDevConfig,
    handleDevModeRun,
    handleDevModeTestWebhook,
  };
}
