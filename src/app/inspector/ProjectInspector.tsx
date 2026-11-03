// Shown when nothing is selected: the canvas name and its themes. Nothing else —
// everything there is to learn lives on the demo canvas.
import { Moon, Plus, RotateCcw, Star, Sun, Trash2 } from 'lucide-react';
import { addTheme, makePrimaryTheme, removeTheme, renameProject, updateTheme } from '../actions';
import { isSampleId } from '../sample';
import { getEditor, useEditor } from '../store';
import { useUI } from '../ui-store';
import { Badge, Button, CommitInput, IconButton, Section, Tooltip, cn } from '../ui';

export function ProjectInspector() {
  const project = useEditor((s) => s.project);
  const themeId = useEditor((s) => s.themeId);
  const demo = isSampleId(project.id);
  const nodes = project.nodes.filter((n) => n.type !== 'note' && n.type !== 'section').length;

  return (
    <div>
      <div className="border-b border-line px-4 pb-3.5 pt-2.5">
        <div className="mb-1.5 flex h-7 items-center justify-between text-[11px] font-medium text-fg-3">
          <span>Canvas</span>
          {demo && (
            <Tooltip content="The demo can be edited freely and reset at any time. It can’t be deleted.">
              <span><Badge tone="accent">Demo</Badge></span>
            </Tooltip>
          )}
        </div>
        <CommitInput
          aria-label="Canvas name"
          value={project.name}
          onCommit={renameProject}
          className="-mx-2 h-8 w-[calc(100%+16px)] bg-transparent px-2 text-[14px] font-semibold tracking-[-0.01em]"
        />
        <div className="num mt-0.5 text-[11px] text-fg-3">
          {nodes} {nodes === 1 ? 'node' : 'nodes'} · {project.edges.length} {project.edges.length === 1 ? 'connection' : 'connections'}
        </div>
        {demo && (
          <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => useUI.getState().setResetOpen(true)}>
            <RotateCcw size={13} /> Reset demo
          </Button>
        )}
      </div>

      <Section
        title="Themes"
        actions={
          <IconButton label="Add a theme" size="icon-sm" onClick={() => addTheme(`Theme ${project.themes.length + 1}`, !(project.themes[project.themes.length - 1]?.dark ?? false))}>
            <Plus size={14} />
          </IconButton>
        }
      >
        <ul className="-mx-1.5 space-y-px">
          {project.themes.map((theme, i) => {
            const active = theme.id === themeId;
            return (
              <li key={theme.id} className={cn('group flex h-8 items-center gap-0.5 rounded-[7px] px-1 transition-colors', active ? 'bg-surface-2' : 'hover:bg-surface-2/60')}>
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
                <IconButton
                  label={theme.dark ? 'Dark theme — click to make it light' : 'Light theme — click to make it dark'}
                  size="icon-sm"
                  className="h-6 w-6"
                  onClick={() => updateTheme(theme.id, { dark: !theme.dark })}
                >
                  {theme.dark ? <Moon size={12} /> : <Sun size={12} />}
                </IconButton>
                <CommitInput
                  aria-label="Theme name"
                  value={theme.name}
                  onCommit={(v) => updateTheme(theme.id, { name: v.trim() || theme.name })}
                  className="h-7 min-w-0 flex-1 bg-transparent px-1.5 text-[12.5px]"
                />
                {i === 0 ? (
                  <Tooltip content="Other themes fall back to the primary theme">
                    <span className="pr-1 text-[10.5px] font-medium text-fg-3">Primary</span>
                  </Tooltip>
                ) : (
                  <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <IconButton label="Make primary" size="icon-sm" className="h-6 w-6" onClick={() => makePrimaryTheme(theme.id)}>
                      <Star size={12} />
                    </IconButton>
                    <IconButton label="Delete theme" size="icon-sm" className="h-6 w-6 hover:bg-danger/10 hover:text-danger" onClick={() => removeTheme(theme.id)}>
                      <Trash2 size={12} />
                    </IconButton>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <p className="px-4 py-5 text-center text-[11.5px] text-fg-3">Select a node to inspect it.</p>
    </div>
  );
}
