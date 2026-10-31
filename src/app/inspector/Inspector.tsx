// Right-panel inspector: switches on the current selection.
import { useMemo } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { NODE_LABELS } from '@/engine/defaults';
import { deleteNodes, duplicateNodes } from '../actions';
import { useEditor } from '../store';
import { Button, Section, Swatch } from '../ui';
import { outputColor } from '@/engine/compute';
import { ColorInspector } from './ColorInspector';
import { ContrastInspector } from './ContrastInspector';
import { MixInspector } from './MixInspector';
import { NoteInspector } from './NoteInspector';
import { PaletteInspector } from './PaletteInspector';
import { ProjectInspector } from './ProjectInspector';
import { TokenInspector } from './TokenInspector';
import { focusNode, TYPE_ICONS } from './common';

export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const node = useEditor((s) => (s.selection.length === 1 ? s.project.nodes.find((n) => n.id === s.selection[0]) : undefined));

  if (selection.length > 1) return <MultiInspector ids={selection} />;
  if (!node) return <ProjectInspector />;

  switch (node.type) {
    case 'color': return <ColorInspector key={node.id} node={node} />;
    case 'palette': return <PaletteInspector key={node.id} node={node} />;
    case 'mix': return <MixInspector key={node.id} node={node} />;
    case 'contrast': return <ContrastInspector key={node.id} node={node} />;
    case 'token': return <TokenInspector key={node.id} node={node} />;
    case 'note': return <NoteInspector key={node.id} node={node} />;
  }
}

function MultiInspector({ ids }: { ids: string[] }) {
  const allNodes = useEditor((s) => s.project.nodes);
  const nodes = useMemo(() => allNodes.filter((n) => ids.includes(n.id)), [allNodes, ids]);
  const results = useEditor((s) => s.result.nodes);
  return (
    <div>
      <div className="border-b border-line px-4 pb-3.5 pt-3">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-3">Selection</div>
        <div className="text-[14px] font-semibold text-fg">{ids.length} nodes selected</div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => duplicateNodes(ids)}><Copy size={13} /> Duplicate</Button>
          <Button size="sm" variant="danger" onClick={() => deleteNodes(ids)}><Trash2 size={13} /> Delete</Button>
        </div>
      </div>
      <Section title="Nodes">
        <ul className="space-y-0.5">
          {nodes.map((n) => {
            const Icon = TYPE_ICONS[n.type];
            const color = outputColor(results[n.id]);
            return (
              <li key={n.id}>
                <button type="button" onClick={() => focusNode(n.id)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-3">
                  {color ? <Swatch color={color.hexa} className="h-4 w-4 rounded" /> : <Icon size={14} className="text-fg-3" />}
                  <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{n.type === 'note' ? 'Note' : n.name}</span>
                  <span className="text-[11px] text-fg-3">{NODE_LABELS[n.type]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
