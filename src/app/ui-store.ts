// UI preferences and transient UI state (not part of the project, not undoable).
import { create } from 'zustand';

export type AppTheme = 'system' | 'dark' | 'light';
export type PanelTab = 'inspect' | 'tokens' | 'preview' | 'code';
export type Tool = 'select' | 'hand';
export type Backdrop = 'app' | 'dark' | 'gray' | 'light';

interface UIState {
  appTheme: AppTheme;
  resolvedTheme: 'dark' | 'light';
  panelTab: PanelTab;
  panelOpen: boolean;
  tool: Tool;
  backdrop: Backdrop;
  minimap: boolean;
  shortcutsOpen: boolean;
  setAppTheme: (t: AppTheme) => void;
  setPanelTab: (t: PanelTab) => void;
  setPanelOpen: (open: boolean) => void;
  setTool: (t: Tool) => void;
  setBackdrop: (b: Backdrop) => void;
  setMinimap: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(`0colors:${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(`0colors:${key}`, JSON.stringify(value)); } catch { /* storage unavailable */ }
};

const media = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
const resolve = (t: AppTheme): 'dark' | 'light' => (t === 'system' ? (media?.matches ?? true ? 'dark' : 'light') : t);

function readAppTheme(): AppTheme {
  try {
    const v = localStorage.getItem('0colors:app-theme');
    return v === 'dark' || v === 'light' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const initialTheme = readAppTheme();

export const useUI = create<UIState>()((set) => ({
  appTheme: initialTheme,
  resolvedTheme: resolve(initialTheme),
  panelTab: read<PanelTab>('panel-tab', 'inspect'),
  panelOpen: read<boolean>('panel-open', typeof innerWidth === 'undefined' || innerWidth >= 900),
  tool: coarse ? 'hand' : 'select',
  backdrop: read<Backdrop>('backdrop', 'app'),
  minimap: read<boolean>('minimap', true),
  shortcutsOpen: false,
  setAppTheme: (appTheme) => {
    try { localStorage.setItem('0colors:app-theme', appTheme); } catch { /* ignore */ }
    const resolvedTheme = resolve(appTheme);
    document.documentElement.dataset.theme = resolvedTheme;
    set({ appTheme, resolvedTheme });
  },
  setPanelTab: (panelTab) => { write('panel-tab', panelTab); set({ panelTab, panelOpen: true }); write('panel-open', true); },
  setPanelOpen: (panelOpen) => { write('panel-open', panelOpen); set({ panelOpen }); },
  setTool: (tool) => set({ tool }),
  setBackdrop: (backdrop) => { write('backdrop', backdrop); set({ backdrop }); },
  setMinimap: (minimap) => { write('minimap', minimap); set({ minimap }); },
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
}));

media?.addEventListener('change', () => {
  const { appTheme, setAppTheme } = useUI.getState();
  if (appTheme === 'system') setAppTheme('system');
});
