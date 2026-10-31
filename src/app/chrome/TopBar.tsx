import { Code2, Keyboard, Monitor, Moon, PanelRight, Plus, Redo2, Sun, Undo2 } from 'lucide-react';
import { useEditor } from '../store';
import { useUI } from '../ui-store';
import { addTheme } from '../actions';
import { IconButton, Tooltip, cn } from '../ui';
import { ProjectMenu } from './ProjectMenu';

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6b6b" />
          <stop offset="0.35" stopColor="#ffd166" />
          <stop offset="0.65" stopColor="#4fd1c5" />
          <stop offset="1" stopColor="#6c8cff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" className="fill-fg" />
      <ellipse cx="32" cy="32" rx="12" ry="16" fill="none" stroke="url(#logo-g)" strokeWidth="6.5" />
    </svg>
  );
}

function ThemeSwitcher() {
  const themes = useEditor((s) => s.project.themes);
  const themeId = useEditor((s) => s.themeId);
  const setTheme = useEditor((s) => s.setTheme);
  return (
    <div className="flex items-center gap-1">
      <div role="radiogroup" aria-label="Active theme" className="flex max-w-[44vw] items-center overflow-x-auto rounded-xl border border-line bg-surface-2 p-0.5">
        {themes.map((t, i) => (
          <Tooltip key={t.id} content={`${t.name}${i === 0 ? ' · primary theme' : ''}${t.dark ? ' · dark' : ''}`}>
            <button
              type="button"
              role="radio"
              aria-checked={t.id === themeId}
              onClick={() => setTheme(t.id)}
              className={cn(
                'flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors',
                t.id === themeId ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-fg-3 hover:text-fg',
              )}
            >
              {t.dark ? <Moon size={12} /> : <Sun size={12} />}
              {t.name}
            </button>
          </Tooltip>
        ))}
      </div>
      <IconButton
        label="Add a theme"
        size="icon-sm"
        onClick={() => {
          const last = themes[themes.length - 1];
          addTheme(`Theme ${themes.length + 1}`, !(last?.dark ?? false));
        }}
      >
        <Plus size={14} />
      </IconButton>
    </div>
  );
}

export function TopBar() {
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const { appTheme, setAppTheme, panelOpen, setPanelOpen, setPanelTab, panelTab, setShortcutsOpen } = useUI();
  const nextAppTheme = appTheme === 'system' ? 'dark' : appTheme === 'dark' ? 'light' : 'system';
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? '⌘' : 'Ctrl+';

  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <a href="/" className="flex items-center gap-2 rounded-lg px-1 py-1" aria-label="0colors">
          <Logo className="h-7 w-7" />
          <span className="hidden text-[14px] font-semibold tracking-tight sm:inline"><span className="text-fg-3">0</span>colors</span>
        </a>
        <span className="hidden h-5 w-px bg-line sm:block" />
        <ProjectMenu />
      </div>

      <div className="absolute left-1/2 hidden -translate-x-1/2 md:block">
        <ThemeSwitcher />
      </div>

      <div className="flex items-center gap-0.5">
        <div className="md:hidden"><ThemeSwitcher /></div>
        <IconButton label="Undo" shortcut={`${mod}Z`} side="bottom" disabled={!canUndo} onClick={undo}><Undo2 size={16} /></IconButton>
        <IconButton label="Redo" shortcut={mac ? '⇧⌘Z' : 'Ctrl+Y'} side="bottom" disabled={!canRedo} onClick={redo}><Redo2 size={16} /></IconButton>
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <IconButton label="Keyboard shortcuts" shortcut="?" side="bottom" className="hidden sm:inline-flex" onClick={() => setShortcutsOpen(true)}><Keyboard size={16} /></IconButton>
        <IconButton
          label={`App theme: ${appTheme} (click for ${nextAppTheme})`}
          side="bottom"
          onClick={() => setAppTheme(nextAppTheme)}
        >
          {appTheme === 'system' ? <Monitor size={16} /> : appTheme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
        </IconButton>
        <IconButton label="Export code" side="bottom" active={panelOpen && panelTab === 'code'} onClick={() => (panelOpen && panelTab === 'code' ? setPanelOpen(false) : setPanelTab('code'))}>
          <Code2 size={16} />
        </IconButton>
        <IconButton label={panelOpen ? 'Hide panel' : 'Show panel'} side="bottom" active={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>
          <PanelRight size={16} />
        </IconButton>
      </div>
    </header>
  );
}
