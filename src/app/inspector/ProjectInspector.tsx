// Shown when nothing is selected: canvas name, themes, an overview and a glossary.
import { Moon, Plus, Sun, Trash2 } from 'lucide-react';
import type { NodeType } from '@/engine/model';
import { NODE_LABELS } from '@/engine/defaults';
import { addTheme, makePrimaryTheme, removeTheme, renameProject, updateTheme } from '../actions';
import { getEditor, useEditor } from '../store';
import { Badge, Button, CommitInput, IconButton, Kbd, Section, Switch, cn } from '../ui';
import { Code, Explain, TYPE_ICONS } from './common';
import { Glossary } from './Glossary';

const TYPES: NodeType[] = ['color', 'palette', 'mix', 'contrast', 'token', 'note'];

export function ProjectInspector() {
  const project = useEditor((s) => s.project);
  const themeId = useEditor((s) => s.themeId);
  const counts = TYPES.map((t) => ({ type: t, count: project.nodes.filter((n) => n.type === t).length }));

  return (
    <div>
      <div className="border-b border-line px-4 pb-3.5 pt-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-3">Canvas</div>
        <CommitInput aria-label="Canvas name" value={project.name} onCommit={renameProject} className="h-9 text-[14px] font-semibold" />
        <div className="mt-1.5 text-[11px] text-fg-3">Select a node to see how its color is computed.</div>
      </div>

      <Section
        title="Themes"
        actions={
          <Button size="sm" variant="ghost" onClick={() => addTheme(`Theme ${project.themes.length + 1}`, false)}>
            <Plus size={13} /> Add
          </Button>
        }
      >
        <ul className="space-y-1.5">
          {project.themes.map((theme, i) => {
            const active = theme.id === themeId;
            return (
              <li
                key={theme.id}
                className={cn('rounded-xl border p-2 transition-colors', active ? 'border-accent/60 bg-accent-soft' : 'border-line bg-surface-2/60')}
              >
                <div className="flex items-center gap-1.5">
                  <IconButton
                    label={active ? 'Active theme' : 'Switch to this theme'}
                    size="icon-sm"
                    active={active}
                    onClick={() => getEditor().setTheme(theme.id)}
                  >
                    {theme.dark ? <Moon size={13} /> : <Sun size={13} />}
                  </IconButton>
                  <CommitInput
                    aria-label="Theme name"
                    value={theme.name}
                    onCommit={(v) => updateTheme(theme.id, { name: v.trim() || theme.name })}
                    className="h-7 flex-1 text-[12.5px]"
                  />
                  <IconButton
                    label={project.themes.length <= 1 ? 'A canvas needs at least one theme' : 'Delete theme'}
                    size="icon-sm"
                    variant="danger"
                    disabled={project.themes.length <= 1}
                    onClick={() => removeTheme(theme.id)}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
                <div className="mt-1.5 flex items-center gap-2 pl-8">
                  <label className="flex items-center gap-1.5 text-[11.5px] text-fg-2">
                    <Switch checked={theme.dark} onChange={(v) => updateTheme(theme.id, { dark: v })} label={`${theme.name} is dark`} />
                    Dark
                  </label>
                  <span className="ml-auto">
                    {i === 0 ? (
                      <Badge tone="accent">Primary</Badge>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => makePrimaryTheme(theme.id)}>
                        Make primary
                      </Button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <Explain className="mt-2.5">
          Every token gets one input per theme. Leave one empty and it falls back to the primary theme. Formulas can read{' '}
          <Code>dark</Code> to adapt, e.g. <Code>dark ? 80 : 30</Code>.
        </Explain>
      </Section>

      <Section title="On this canvas">
        <div className="grid grid-cols-3 gap-1.5">
          {counts.map(({ type, count }) => {
            const Icon = TYPE_ICONS[type];
            return (
              <div key={type} className="rounded-lg bg-surface-2 px-2 py-1.5">
                <div className="flex items-center gap-1 text-[11px] text-fg-3">
                  <Icon size={11} /> {NODE_LABELS[type]}
                </div>
                <div className="num text-[15px] font-semibold text-fg">{count}</div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="How it works">
        <ul className="space-y-2 text-[12px] leading-snug text-fg-2">
          <li className="flex gap-2"><span className="text-fg-3">1</span><span><b className="font-medium text-fg">Root colors</b> hold their own values. Drag from a node’s right edge to derive a new color from it.</span></li>
          <li className="flex gap-2"><span className="text-fg-3">2</span><span>Each derived channel follows a <b className="font-medium text-fg">rule</b>: inherit, offset, fixed, or a formula.</span></li>
          <li className="flex gap-2"><span className="text-fg-3">3</span><span><b className="font-medium text-fg">Palettes</b> turn one hue into a lightness scale; every step is its own output.</span></li>
          <li className="flex gap-2"><span className="text-fg-3">4</span><span><b className="font-medium text-fg">Tokens</b> give colors a purpose and can point somewhere different in every theme.</span></li>
          <li className="flex gap-2"><span className="text-fg-3">5</span><span>Change anything upstream and everything downstream recomputes instantly.</span></li>
        </ul>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px] text-fg-3">
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
