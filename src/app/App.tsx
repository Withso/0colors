import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Toaster, toast } from 'sonner';
import { X } from 'lucide-react';
import { getEditor } from './store';
import { type PanelTab, useUI } from './ui-store';
import { bootProject, createCanvas, saveNow, startAutosave } from './persist';
import { decodeShare, readShareCode } from '@/engine/share';
import { Canvas } from './canvas/Canvas';
import { TopBar } from './chrome/TopBar';
import { Inspector } from './inspector/Inspector';
import { TokensPanel } from './panels/TokensPanel';
import { PreviewPanel } from './panels/PreviewPanel';
import { CodePanel } from './panels/CodePanel';
import { Dialog, IconButton, Kbd, TooltipProvider, cn } from './ui';
import { CommandPalette } from './chrome/CommandPalette';
import { ResetDemoDialog } from './chrome/ResetDemoDialog';

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
      <div className="flex h-11 shrink-0 items-stretch gap-2 border-b border-line pl-4 pr-2">
        <div role="tablist" aria-label="Panel" className="flex flex-1 items-stretch gap-4">
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
                  'relative text-[12.5px] font-medium outline-none transition-colors duration-150 focus-visible:text-fg',
                  on ? 'text-fg' : 'text-fg-3 hover:text-fg-2',
                )}
              >
                {t.label}
                <span className={cn('absolute inset-x-0 -bottom-px h-[1.5px] rounded-full bg-fg transition-opacity duration-150', on ? 'opacity-100' : 'opacity-0')} />
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
  ['Search everything · run any command', '⌘K'],
  ['Quick-add at the cursor', '/  Tab'],
  ['Add color · palette · mix · contrast · token · note · section', 'C  P  M  K  T  N  S'],
  ['Add a color at the cursor', 'Double-click canvas'],
  ['Derive a connected node', 'Drag from a right-side dot'],
  ['Connect without aiming', 'Drop a connection on a node'],
  ['Move a connection · disconnect it', 'Drag out of the input it feeds · drop on empty canvas'],
  ['Insert a node into a connection', 'Drop an unconnected node on it'],
  ['Cut connections', 'Hold X and drag across them · or right-drag'],
  ['Create the source for an input', 'Drag from a left-side dot'],
  ['Duplicate while dragging', '⌥ drag'],
  ['Wrap the selection in a section', '⌥⌘G'],
  ['Zoom to selection', '⇧2'],
  ['Rename the selected node', '↵'],
  ['Select tool · Hand tool (or hold Space)', 'V  H'],
  ['Box select', 'Drag on empty canvas'],
  ['Add to selection', '⇧ / ⌘ click'],
  ['Pan · Zoom', 'Scroll · ⌘/Ctrl + scroll or pinch'],
  ['Fit everything · Zoom to 100%', 'F  ⇧1  ⇧0'],
  ['Zoom in · out', '+  −'],
  ['See where a color comes from and goes', 'Hover a node'],
  ['Nudge selection', 'Arrows (⇧ = 5×)'],
  ['Duplicate · Copy · Paste', '⌘D  ⌘C  ⌘V'],
  ['Delete selection', '⌫'],
  ['Undo · Redo', '⌘Z  ⇧⌘Z'],
  ['Select all · Deselect', '⌘A  Esc'],
  ['Scrub a channel on the canvas', 'Drag a value on a color node'],
  ['Scrub a number in the panel', 'Drag its label (⇧ faster, ⌥ finer)'],
  ['Rename a node', 'Double-click its title'],
];

function ShortcutsDialog() {
  const { shortcutsOpen, setShortcutsOpen } = useUI();
  return (
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} title="Keyboard & mouse" description="On Windows and Linux, use Ctrl instead of ⌘.">
      <div className="divide-y divide-line">
        {SHORTCUTS.map(([what, keys]) => (
          <div key={what} className="flex items-center justify-between gap-4 py-2 text-[12.5px]">
            <span className="text-fg-2">{what}</span>
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              {keys.split('  ').map((k) => {
                const key = k.trim();
                // Short keys get key caps; mouse gestures read better as plain text.
                return /\s/.test(key) && key.length > 6
                  ? <span key={key} className="text-[12px] text-fg-3">{key}</span>
                  : <Kbd key={key}>{key}</Kbd>;
              })}
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

  // A share link pasted into an already-open tab only changes the hash; open it as a new canvas.
  useEffect(() => {
    const onHash = async () => {
      const code = readShareCode(location.hash);
      if (!code) return;
      history.replaceState(null, '', location.pathname + location.search);
      try {
        await saveNow();
        await createCanvas(await decodeShare(code));
        toast.success('Opened a shared canvas. This is your own copy — edit away.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'This share link could not be opened.');
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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
    <ReactFlowProvider>
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
      <CommandPalette />
      <ResetDemoDialog />
      <Toaster
        theme={resolvedTheme}
        position="bottom-right"
        toastOptions={{ className: '!glass !text-fg !border-0 !shadow-panel !rounded-[12px] !text-[12.5px] !font-medium' }}
      />
    </TooltipProvider>
    </ReactFlowProvider>
  );
}
