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
      <div className="flex flex-col items-center border-b border-line px-6 pb-5 pt-6 text-center">
        <div className="text-[14px] font-semibold tracking-[-0.01em] text-fg">{ids.length} nodes selected</div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-fg-3">Drag to move them together, or duplicate them as a group — connections between them are kept.</p>
        <div className="mt-3.5 flex gap-2">
          <Button size="sm" variant="primary" onClick={() => duplicateNodes(ids)}><Copy size={13} /> Duplicate</Button>
          <Button size="sm" variant="ghost" className="hover:bg-danger/10 hover:text-danger" onClick={() => deleteNodes(ids)}><Trash2 size={13} /> Delete</Button>
        </div>
      </div>
      <Section title="Nodes">
        <ul className="-mx-1.5">
          {nodes.map((n) => {
            const Icon = TYPE_ICONS[n.type];
            const color = outputColor(results[n.id]);
            return (
              <li key={n.id}>
                <button type="button" onClick={() => focusNode(n.id)} className="flex h-7 w-full items-center gap-2 rounded-[6px] px-1.5 text-left transition-colors hover:bg-surface-2">
                  {color ? <Swatch color={color.hexa} className="h-4 w-4 rounded-[4px]" /> : <Icon size={14} className="text-fg-3" />}
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
