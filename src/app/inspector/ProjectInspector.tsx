// Shown when nothing is selected: canvas name, themes, an overview and a glossary.
import { Moon, Plus, Star, Sun, Trash2 } from 'lucide-react';
import type { NodeType } from '@/engine/model';
import { NODE_LABELS } from '@/engine/defaults';
import { addTheme, makePrimaryTheme, removeTheme, renameProject, updateTheme } from '../actions';
import { getEditor, useEditor } from '../store';
import { Badge, Button, CommitInput, IconButton, Kbd, Section, Tooltip, cn } from '../ui';
import { Code, Explain, TYPE_ICONS } from './common';
import { Glossary } from './Glossary';

const TYPES: NodeType[] = ['color', 'palette', 'mix', 'contrast', 'token', 'note'];

export function ProjectInspector() {
  const project = useEditor((s) => s.project);
  const themeId = useEditor((s) => s.themeId);
  const counts = TYPES.map((t) => ({ type: t, count: project.nodes.filter((n) => n.type === t).length }));

  return (
    <div>
      <div className="border-b border-line px-4 pb-3.5 pt-2.5">
        <div className="mb-1.5 flex h-7 items-center text-[11px] font-medium text-fg-3">Canvas</div>
        <CommitInput
          aria-label="Canvas name"
          value={project.name}
          onCommit={renameProject}
          className="-mx-2 h-8 w-[calc(100%+16px)] bg-transparent px-2 text-[14px] font-semibold tracking-[-0.01em]"
        />
        <div className="mt-1 text-[11px] leading-relaxed text-fg-3">Select a node to see how its color is computed.</div>
      </div>

      <Section
        title="Themes"
        actions={
          <Button size="sm" variant="ghost" onClick={() => addTheme(`Theme ${project.themes.length + 1}`, false)}>
            <Plus size={13} /> Add
          </Button>
        }
      >
        <ul className="-mx-1.5 space-y-0.5">
          {project.themes.map((theme, i) => {
            const active = theme.id === themeId;
            return (
              <li key={theme.id} className={cn('flex h-9 items-center gap-1 rounded-[8px] px-1 transition-colors', active ? 'bg-surface-2' : 'hover:bg-surface-2/60')}>
                <Tooltip content={active ? 'Active theme' : 'Show this theme'}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`Show ${theme.name}`}
                    onClick={() => getEditor().setTheme(theme.id)}
                    className="flex h-7 w-6 shrink-0 items-center justify-center rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <span className={cn('h-3.5 w-3.5 rounded-full border transition-colors', active ? 'border-accent bg-accent shadow-[inset_0_0_0_2.5px_var(--app-surface-2)]' : 'border-line-strong')} />
                  </button>
                </Tooltip>
                <IconButton
                  label={theme.dark ? 'Dark theme — click to make it light' : 'Light theme — click to make it dark'}
                  size="icon-sm"
                  onClick={() => updateTheme(theme.id, { dark: !theme.dark })}
                >
                  {theme.dark ? <Moon size={13} /> : <Sun size={13} />}
                </IconButton>
                <CommitInput
                  aria-label="Theme name"
                  value={theme.name}
                  onCommit={(v) => updateTheme(theme.id, { name: v.trim() || theme.name })}
                  className="h-7 min-w-0 flex-1 bg-transparent px-1.5 text-[12.5px]"
                />
                {i === 0 ? (
                  <Tooltip content="Other themes fall back to the primary theme">
                    <span><Badge tone="accent">Primary</Badge></span>
                  </Tooltip>
                ) : (
                  <IconButton label="Make primary" size="icon-sm" onClick={() => makePrimaryTheme(theme.id)}>
                    <Star size={13} />
                  </IconButton>
                )}
                <IconButton
                  label={project.themes.length <= 1 ? 'A canvas needs at least one theme' : 'Delete theme'}
                  size="icon-sm"
                  className="hover:bg-danger/10 hover:text-danger"
                  disabled={project.themes.length <= 1}
                  onClick={() => removeTheme(theme.id)}
                >
                  <Trash2 size={13} />
                </IconButton>
              </li>
            );
          })}
        </ul>
        <Explain className="mt-2">
          Every token gets one input per theme. The sun/moon sets whether a theme is dark. Leave one empty and it falls back to the primary theme. Formulas can read{' '}
          <Code>dark</Code> to adapt, e.g. <Code>dark ? 80 : 30</Code>.
        </Explain>
      </Section>

      <Section title="On this canvas">
        <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
          {counts.map(({ type, count }) => {
            const Icon = TYPE_ICONS[type];
            return (
              <div key={type}>
                <div className="flex items-center gap-1 text-[11px] text-fg-3">
                  <Icon size={11} /> {NODE_LABELS[type]}
                </div>
                <div className="num text-[15px] font-semibold leading-tight text-fg">{count}</div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="How it works">
        <ul className="space-y-2 text-[12px] leading-relaxed text-fg-2">
          <li className="flex gap-2"><span className="text-fg-3">1</span><span><b className="font-medium text-fg">Root colors</b> hold their own values. Drag from a node’s right edge to derive a new color from it.</span></li>
          <li className="flex gap-2"><span className="text-fg-3">2</span><span>Each derived channel follows a <b className="font-medium text-fg">rule</b>: inherit, offset, fixed, or a formula.</span></li>
          <li className="flex gap-2"><span className="text-fg-3">3</span><span><b className="font-medium text-fg">Palettes</b> turn one hue into a lightness scale; every step is its own output.</span></li>
          <li className="flex gap-2"><span className="text-fg-3">4</span><span><b className="font-medium text-fg">Tokens</b> give colors a purpose and can point somewhere different in every theme.</span></li>
          <li className="flex gap-2"><span className="text-fg-3">5</span><span>Change anything upstream and everything downstream recomputes instantly.</span></li>
        </ul>
        <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-fg-3">
          <span className="flex items-center gap-1.5"><Kbd>Double-click</Kbd> add color</span>
          <span className="flex items-center gap-1.5"><Kbd>⌫</Kbd> delete</span>
          <span className="flex items-center gap-1.5"><Kbd>⌘D</Kbd> duplicate</span>
          <span className="flex items-center gap-1.5"><Kbd>⌘Z</Kbd> undo</span>
          <span className="flex items-center gap-1.5"><Kbd>F</Kbd> fit view</span>
          <span className="flex items-center gap-1.5"><Kbd>⌘C</Kbd>/<Kbd>⌘V</Kbd> copy</span>
        </div>
      </Section>

      <Section title="Glossary">
        <Glossary />
      </Section>
    </div>
  );
}
