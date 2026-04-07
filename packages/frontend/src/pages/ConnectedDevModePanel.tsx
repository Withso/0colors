// ConnectedDevModePanel — reads from Zustand store + hooks, passes props to DevModePanel.
// Eliminates prop drilling from App.tsx.
import { useStore } from '../store';
import { useDevMode } from '../hooks/useDevMode';
import { DevModePanel } from './DevModePanel';

export function ConnectedDevModePanel() {
  // ── Entity state from store ──
  const allNodes = useStore(s => s.allNodes);
  const themes = useStore(s => s.themes);
  const activeProjectId = useStore(s => s.activeProjectId);
  const projects = useStore(s => s.projects);

  // ── UI state from store ──
  const showDevMode = useStore(s => s.showDevMode);
  const setShowDevMode = useStore(s => s.setShowDevMode);

  // ── Auth from store (userId for PAT encryption) ──
  const authSession = useStore(s => s.authSession);

  // ── Dev Mode hook ──
  const { activeDevConfig, updateDevConfig, handleDevModeRun, handleDevModeTestWebhook } = useDevMode();

  // Derived
  const activeProject = projects.find(p => p.id === activeProjectId);

  if (!showDevMode) return null;

  return (
    <DevModePanel
      devConfig={activeDevConfig}
      onUpdateDevConfig={updateDevConfig}
      nodes={allNodes}
      themes={themes}
      activeProjectId={activeProjectId}
      activeProject={activeProject}
      userId={authSession?.userId}
      onClose={() => setShowDevMode(false)}
      onRunNow={handleDevModeRun}
      onTestWebhook={handleDevModeTestWebhook}
    />
  );
}
