// ─────────────────────────────────────────────────────────────
// ⌘K command palette: jump to any node or section, add nodes, and run every
// canvas, view, theme and file command from one searchable list.
// `/` opens the same palette in quick-add mode at the pointer.
// ─────────────────────────────────────────────────────────────
import { type ReactNode, useMemo } from 'react';
import { Command } from 'cmdk';
import { toast } from 'sonner';
import {
  CopyPlus, Download, Frame, Keyboard, Link2, Map as MapIcon, Maximize, Monitor, Moon, PanelRight, Plus, Redo2,
  RotateCcw, ScanSearch, Sparkles, Sun, Undo2, ZoomIn,
} from 'lucide-react';
import type { NodeType } from '@/engine/model';
import { NODE_LABELS } from '@/engine/defaults';
import { outputColor } from '@/engine/compute';
import { slugify, uid } from '@/engine/model';
import { serializeProject } from '@/engine/schema';
import { encodeShare, shareUrl } from '@/engine/share';
import { createBlankProject } from '@/engine/defaults';
import { getEditor, useEditor } from '../store';
import { useUI } from '../ui-store';
import { createCanvas, openCanvas } from '../persist';
import { SAMPLE_ID, isSampleId } from '../sample';
import { downloadText } from '../panels/download';
import { ADD_ITEMS } from '../canvas/Canvas';
import { TYPE_ICONS, focusNode } from '../inspector/common';
import { Kbd, Swatch, cn } from '../ui';

const canvas = (command: string, extra: Record<string, unknown> = {}) =>
  window.dispatchEvent(new CustomEvent('0colors:canvas', { detail: { command, ...extra } }));

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = mac ? '⌘' : 'Ctrl ';

export async function copyShareLink() {
  try {
    const url = shareUrl(location.origin, await encodeShare(getEditor().project));
    await navigator.clipboard.writeText(url);
    toast.success('Link copied — anyone with it gets their own copy');
  } catch {
    toast.error('Couldn’t copy a share link here. Use the Share button instead.');
  }
}

export function exportJson() {
  const { project } = getEditor();
  downloadText(`${slugify(project.name)}.0colors.json`, serializeProject(project), 'application/json');
}

function Item({ value, icon, children, shortcut, onSelect, keywords }: {
  value: string; icon?: ReactNode; children: ReactNode; shortcut?: string; onSelect: () => void; keywords?: string[];
}) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className="group flex h-8 cursor-default select-none items-center gap-2.5 rounded-[7px] px-2 text-[13px] text-fg outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-fg"
    >
      <span className="flex w-4 shrink-0 justify-center text-fg-2 group-data-[selected=true]:text-accent-fg">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="num shrink-0 text-[11px] text-fg-3 group-data-[selected=true]:text-accent-fg/80">{shortcut}</span>}
    </Command.Item>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-3"
    >
      {children}
    </Command.Group>
  );
}

export function CommandPalette() {
  const palette = useUI((s) => s.palette);
  const close = useUI((s) => s.closePalette);
  const nodes = useEditor((s) => s.project.nodes);
  const themes = useEditor((s) => s.project.themes);
  const themeId = useEditor((s) => s.themeId);
  const projectId = useEditor((s) => s.project.id);
  const results = useEditor((s) => s.result.nodes);
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const { panelOpen, minimap } = useUI();
  const open = palette !== null;
  const addOnly = palette?.mode === 'add';

  const run = (fn: () => void) => () => { close(); setTimeout(fn, 0); };
  const add = (type: NodeType) => run(() => {
    if (addOnly && palette?.at) canvas('add-at', { type, at: palette.at });
    else canvas('add', { type });
  });

  const targets = useMemo(() => nodes
    .filter((n) => n.type !== 'note')
    .map((n) => ({ id: n.id, type: n.type, name: n.name, hex: outputColor(results[n.id], 'out')?.hexa ?? null }))
    .sort((a, b) => Number(b.type === 'section') - Number(a.type === 'section')), [nodes, results]);

  const demo = isSampleId(projectId);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(v) => { if (!v) close(); }}
      label={addOnly ? 'Add a node' : 'Command palette'}
      loop
      overlayClassName="animate-fade fixed inset-0 z-50 bg-black/30"
      contentClassName="animate-pop fixed inset-x-0 top-[18vh] z-50 mx-auto w-[min(92vw,560px)] origin-top overflow-hidden rounded-[14px] glass shadow-panel outline-none"
      className="flex max-h-[min(70vh,520px)] flex-col"
    >
      <div className="flex items-center gap-2 border-b border-line px-3.5">
        <ScanSearch size={15} className="shrink-0 text-fg-3" />
        <Command.Input
          autoFocus
          placeholder={addOnly ? 'Add a node…' : 'Search nodes, sections and commands…'}
          className="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3"
        />
        <Kbd>esc</Kbd>
      </div>
      <Command.List className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-8 text-center text-[12.5px] text-fg-3">Nothing matches.</Command.Empty>

        <Group heading={addOnly ? 'Add here' : 'Add'}>
          {ADD_ITEMS.map((i) => (
            <Item key={i.type} value={`add ${i.label}`} keywords={[i.hint]} icon={i.icon} shortcut={i.key} onSelect={add(i.type)}>
              {addOnly ? i.label : `Add ${i.label.toLowerCase()}`}
              <span className="ml-2 text-[11.5px] text-fg-3 group-data-[selected=true]:text-accent-fg/75">{i.hint}</span>
            </Item>
          ))}
        </Group>

        {!addOnly && (
          <>
            {targets.length > 0 && (
              <Group heading="Go to">
                {targets.map((t) => {
                  const Icon = TYPE_ICONS[t.type];
                  return (
                    <Item
                      key={t.id}
                      value={`go ${t.name} ${t.id}`}
                      keywords={[NODE_LABELS[t.type], `@${slugify(t.name)}`]}
                      icon={t.hex ? <Swatch color={t.hex} className="h-3.5 w-3.5 rounded-[4px]" /> : <Icon size={14} />}
                      shortcut={NODE_LABELS[t.type]}
                      onSelect={run(() => focusNode(t.id))}
                    >
                      <span className={cn(t.type === 'token' && 'num text-[12.5px]', t.type === 'section' && 'font-medium')}>{t.name}</span>
                    </Item>
                  );
                })}
              </Group>
            )}

            <Group heading="Canvas">
              <Item value="fit everything zoom to fit" icon={<Maximize size={14} />} shortcut="F" onSelect={run(() => canvas('fit'))}>Zoom to fit</Item>
              {hasSelection && <Item value="zoom to selection" icon={<ZoomIn size={14} />} shortcut="⇧2" onSelect={run(() => canvas('zoom-selection'))}>Zoom to selection</Item>}
              <Item value="zoom to 100%" icon={<ZoomIn size={14} />} shortcut="⇧0" onSelect={run(() => canvas('zoom-100'))}>Zoom to 100%</Item>
              {hasSelection && <Item value="wrap selection in a section frame" icon={<Frame size={14} />} shortcut={`⌥${MOD}G`} onSelect={run(() => canvas('wrap'))}>Wrap selection in a section</Item>}
              <Item value="undo" icon={<Undo2 size={14} />} shortcut={`${MOD}Z`} onSelect={run(() => getEditor().undo())}>Undo</Item>
              <Item value="redo" icon={<Redo2 size={14} />} shortcut={mac ? '⇧⌘Z' : 'Ctrl Y'} onSelect={run(() => getEditor().redo())}>Redo</Item>
            </Group>

            <Group heading="Theme">
              {themes.map((t) => (
                <Item
                  key={t.id}
                  value={`theme ${t.name}`}
                  icon={t.dark ? <Moon size={14} /> : <Sun size={14} />}
                  shortcut={t.id === themeId ? 'Active' : undefined}
                  onSelect={run(() => getEditor().setTheme(t.id))}
                >
                  Show {t.name} theme
                </Item>
              ))}
            </Group>

            <Group heading="View">
              <Item value="toggle side panel inspector" icon={<PanelRight size={14} />} onSelect={run(() => useUI.getState().setPanelOpen(!panelOpen))}>
                {panelOpen ? 'Hide the side panel' : 'Show the side panel'}
              </Item>
              <Item value="toggle minimap" icon={<MapIcon size={14} />} onSelect={run(() => useUI.getState().setMinimap(!minimap))}>
                {minimap ? 'Hide the minimap' : 'Show the minimap'}
              </Item>
              <Item value="appearance light" icon={<Sun size={14} />} onSelect={run(() => useUI.getState().setAppTheme('light'))}>Appearance: Light</Item>
              <Item value="appearance dark" icon={<Moon size={14} />} onSelect={run(() => useUI.getState().setAppTheme('dark'))}>Appearance: Dark</Item>
              <Item value="appearance system" icon={<Monitor size={14} />} onSelect={run(() => useUI.getState().setAppTheme('system'))}>Appearance: Match system</Item>
            </Group>

            <Group heading="File">
              <Item value="new blank canvas" icon={<Plus size={14} />} onSelect={run(() => { void createCanvas(createBlankProject()).then(() => toast.success('New blank canvas')); })}>New blank canvas</Item>
              {demo ? (
                <Item value="reset demo" icon={<RotateCcw size={14} />} onSelect={run(() => useUI.getState().setResetOpen(true))}>Reset the demo…</Item>
              ) : (
                <Item value="open demo sample tutorial" icon={<Sparkles size={14} />} onSelect={run(() => { void openCanvas(SAMPLE_ID); })}>Open the demo</Item>
              )}
              <Item
                value="duplicate canvas copy"
                icon={<CopyPlus size={14} />}
                onSelect={run(() => {
                  const now = Date.now();
                  const copy = { ...structuredClone(getEditor().project), id: uid('p_'), name: `${getEditor().project.name} copy`, createdAt: now, updatedAt: now };
                  void createCanvas(copy).then(() => toast.success(`Opened “${copy.name}”`));
                })}
              >
                {demo ? 'Make my own copy of the demo' : 'Duplicate canvas'}
              </Item>
              <Item value="export json download" icon={<Download size={14} />} onSelect={run(exportJson)}>Export JSON</Item>
              <Item value="copy share link" icon={<Link2 size={14} />} onSelect={run(() => { void copyShareLink(); })}>Copy share link</Item>
            </Group>

            <Group heading="Help">
              <Item value="keyboard shortcuts help" icon={<Keyboard size={14} />} shortcut="?" onSelect={run(() => useUI.getState().setShortcutsOpen(true))}>Keyboard shortcuts</Item>
            </Group>
          </>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
