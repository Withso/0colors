import { useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { X } from 'lucide-react';
import { getEditor } from './store';
import { type PanelTab, useUI } from './ui-store';
import { bootProject, startAutosave } from './persist';
import { Canvas } from './canvas/Canvas';
import { TopBar } from './chrome/TopBar';
import { Inspector } from './inspector/Inspector';
import { TokensPanel } from './panels/TokensPanel';
import { PreviewPanel } from './panels/PreviewPanel';
import { CodePanel } from './panels/CodePanel';
import { Dialog, IconButton, Kbd, TooltipProvider, cn } from './ui';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'inspect', label: 'Inspect' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'preview', label: 'Preview' },
  { id: 'code', label: 'Code' },
];

function RightPanel() {
  const { panelTab, setPanelTab, setPanelOpen } = useUI();
  return (
    <aside
      className={cn(
        'z-30 flex flex-col bg-surface',
        'animate-sheet fixed inset-x-0 bottom-0 h-[62vh] rounded-t-[16px] shadow-panel',
        'md:static md:h-auto md:w-[320px] md:shrink-0 md:animate-none md:rounded-none md:shadow-[inset_0.5px_0_0_var(--app-line-strong)]',
      )}
    >
      <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line-strong md:hidden" />
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <div role="tablist" aria-label="Panel" className="flex flex-1 gap-px rounded-[9px] bg-surface-2 p-[2px]">
          {TABS.map((t) => {
            const on = panelTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPanelTab(t.id)}
                className={cn(
                  'h-[26px] flex-1 rounded-[7px] text-[12px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-accent/60',
                  on ? 'bg-raised text-fg shadow-[0_1px_2px_oklch(0_0_0/0.18),0_0_0_0.5px_oklch(0_0_0/0.12)]' : 'text-fg-3 hover:text-fg-2',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <IconButton label="Close panel" size="icon-sm" className="md:hidden" onClick={() => setPanelOpen(false)}><X size={14} /></IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {panelTab === 'inspect' && <Inspector />}
        {panelTab === 'tokens' && <TokensPanel />}
        {panelTab === 'preview' && <PreviewPanel />}
        {panelTab === 'code' && <CodePanel />}
      </div>
    </aside>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Add color · palette · mix · contrast · token · note', 'C  P  M  K  T  N'],
  ['Add a color at the cursor', 'Double-click canvas'],
  ['Derive a connected node', 'Drag from a right-side handle'],
  ['Create the source for an input', 'Drag from a left-side handle'],
  ['Select / Pan tool', 'V  ·  H (or hold Space)'],
  ['Box select', 'Drag on empty canvas'],
  ['Add to selection', '⇧ / ⌘ click'],
  ['Pan · Zoom', 'Scroll · ⌘/Ctrl + scroll or pinch'],
  ['Fit everything', 'F'],
  ['Nudge selection', 'Arrows (⇧ = 5×)'],
  ['Duplicate · Copy · Paste', '⌘D · ⌘C · ⌘V'],
  ['Delete selection', 'Delete / Backspace'],
  ['Undo · Redo', '⌘Z · ⇧⌘Z'],
  ['Select all · Deselect', '⌘A · Esc'],
  ['Scrub a number', 'Drag its label (⇧ faster, ⌥ finer)'],
];

function ShortcutsDialog() {
  const { shortcutsOpen, setShortcutsOpen } = useUI();
  return (
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} title="Keyboard & mouse" description="On Windows and Linux, use Ctrl instead of ⌘.">
      <div className="divide-y divide-line">
        {SHORTCUTS.map(([what, keys]) => (
          <div key={what} className="flex items-center justify-between gap-4 py-2 text-[12.5px]">
            <span className="text-fg-2">{what}</span>
            <span className="flex shrink-0 flex-wrap justify-end gap-1">
              {keys.split('  ').map((k) => <Kbd key={k}>{k.trim()}</Kbd>)}
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

let booted = false;

export function App() {
  const [ready, setReady] = useState(false);
  const panelOpen = useUI((s) => s.panelOpen);
  const resolvedTheme = useUI((s) => s.resolvedTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (booted) { setReady(true); return; }
    booted = true;
    bootProject().then(({ project, source, error }) => {
      getEditor().load(project);
      setReady(true);
      startAutosave();
      if (source === 'share') toast.success('Opened a shared canvas. This is your own copy — edit away.');
      if (error) toast.error(error);
    });
  }, []);

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="relative flex min-h-0 flex-1">
          <main className="relative min-w-0 flex-1">
            {ready ? <Canvas /> : <div className="flex h-full items-center justify-center text-[12.5px] text-fg-3">Loading your canvas…</div>}
          </main>
          {panelOpen && <RightPanel />}
        </div>
      </div>
      <ShortcutsDialog />
      <Toaster
        theme={resolvedTheme}
        position="bottom-right"
        toastOptions={{ className: '!glass !text-fg !border-0 !shadow-panel !rounded-[12px] !text-[12.5px] !font-medium' }}
      />
    </TooltipProvider>
  );
}
