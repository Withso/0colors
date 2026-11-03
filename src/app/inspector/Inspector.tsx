// Right-panel inspector: switches on the current selection.
import { useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceAround,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceAround, BoxSelect, Copy, Frame, Trash2,
} from 'lucide-react';
import type { NoteTone, SectionNode } from '@/engine/model';
import { NODE_LABELS } from '@/engine/defaults';
import { type AlignMode, type Rect, alignNodes, deleteNodes, duplicateNodes, resizeNodes, updateNodeData, wrapInSection } from '../actions';
import { getEditor, useEditor } from '../store';
import { Button, IconButton, NumberField, Section, Segmented, Swatch } from '../ui';
import { outputColor } from '@/engine/compute';
import { SECTION_TONES } from '../canvas/nodes';
import { ColorInspector } from './ColorInspector';
import { ContrastInspector } from './ContrastInspector';
import { MixInspector } from './MixInspector';
import { NoteInspector } from './NoteInspector';
import { PaletteInspector } from './PaletteInspector';
import { ProjectInspector } from './ProjectInspector';
import { TokenInspector } from './TokenInspector';
import { InspectorHeader, focusNode, TYPE_ICONS } from './common';

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
    case 'section': return <SectionInspector key={node.id} node={node} />;
    case 'html': return <InspectorHeader key={node.id} node={node} hint={<span className="num text-fg-3">/tutorials/{node.data.doc}.html · built into the demo</span>} />;
  }
}

/** Current rectangles of nodes on the canvas (flow coordinates), from React Flow's measurements. */
function useRects() {
  const rf = useReactFlow();
  return (ids: string[]): Record<string, Rect> => {
    const out: Record<string, Rect> = {};
    for (const id of ids) {
      const n = rf.getInternalNode(id);
      if (n) out[id] = { x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, width: n.measured.width ?? 0, height: n.measured.height ?? 0 };
    }
    return out;
  };
}

const ALIGN: { mode: AlignMode; label: string; icon: typeof AlignStartVertical }[] = [
  { mode: 'left', label: 'Align left', icon: AlignStartVertical },
  { mode: 'center', label: 'Align centers horizontally', icon: AlignCenterVertical },
  { mode: 'right', label: 'Align right', icon: AlignEndVertical },
  { mode: 'top', label: 'Align top', icon: AlignStartHorizontal },
  { mode: 'middle', label: 'Align centers vertically', icon: AlignCenterHorizontal },
  { mode: 'bottom', label: 'Align bottom', icon: AlignEndHorizontal },
  { mode: 'distribute-x', label: 'Distribute horizontally', icon: AlignHorizontalSpaceAround },
  { mode: 'distribute-y', label: 'Distribute vertically', icon: AlignVerticalSpaceAround },
];

function MultiInspector({ ids }: { ids: string[] }) {
  const allNodes = useEditor((s) => s.project.nodes);
  const nodes = useMemo(() => allNodes.filter((n) => ids.includes(n.id)), [allNodes, ids]);
  const results = useEditor((s) => s.result.nodes);
  const rects = useRects();
  return (
    <div>
      <div className="border-b border-line px-4 pb-3.5 pt-2.5">
        <div className="mb-1.5 flex h-7 items-center text-[11px] font-medium text-fg-3">Selection</div>
        <div className="text-[14px] font-semibold tracking-[-0.01em] text-fg">{ids.length} nodes</div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => duplicateNodes(ids)}><Copy size={13} /> Duplicate</Button>
          <Button size="sm" variant="secondary" onClick={() => wrapInSection(Object.values(rects(ids)))}><Frame size={13} /> Section</Button>
          <Button size="sm" variant="secondary" className="hover:bg-danger/10 hover:text-danger" onClick={() => deleteNodes(ids)}><Trash2 size={13} /> Delete</Button>
        </div>
      </div>
      <Section title="Arrange">
        <div className="flex items-center justify-between">
          {ALIGN.map(({ mode, label, icon: Icon }, i) => (
            <span key={mode} className="flex items-center">
              {i === 6 && <span className="mx-1 h-4 w-px bg-line-strong" />}
              <IconButton label={label} size="icon-sm" disabled={mode.startsWith('distribute') && ids.length < 3} onClick={() => alignNodes(mode, rects(ids))}>
                <Icon size={14} />
              </IconButton>
            </span>
          ))}
        </div>
      </Section>
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

const TONES: NoteTone[] = ['neutral', 'yellow', 'blue', 'green', 'pink', 'purple'];

function SectionInspector({ node }: { node: SectionNode }) {
  const rf = useReactFlow();
  const contents = () => {
    const box = rf.getInternalNode(node.id);
    if (!box) return [];
    const b = { x: box.internals.positionAbsolute.x, y: box.internals.positionAbsolute.y, w: box.measured.width ?? 0, h: box.measured.height ?? 0 };
    return getEditor().project.nodes.filter((n) => {
      if (n.id === node.id) return false;
      const r = rf.getInternalNode(n.id);
      if (!r) return false;
      const x = r.internals.positionAbsolute.x;
      const y = r.internals.positionAbsolute.y;
      return x >= b.x && y >= b.y && x + (r.measured.width ?? 0) <= b.x + b.w && y + (r.measured.height ?? 0) <= b.y + b.h;
    }).map((n) => n.id);
  };
  return (
    <div>
      <InspectorHeader node={node} />
      <Section title="Frame">
        <Segmented
          size="sm"
          value={node.data.tone}
          onChange={(v) => updateNodeData<SectionNode>(node.id, (d) => { d.tone = v; })}
          options={TONES.map((t) => ({
            value: t,
            title: t[0].toUpperCase() + t.slice(1),
            label: <span className="mx-auto block h-3 w-3 rounded-full ring-1 ring-inset ring-black/10" style={{ background: SECTION_TONES[t].dot }} />,
          }))}
        />
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <NumberField label="W" value={node.data.width} min={160} max={8000} step={8} onChange={(v) => resizeNodes([{ id: node.id, width: v }])} onScrubEnd={() => getEditor().breakCoalesce()} />
          <NumberField label="H" value={node.data.height} min={120} max={8000} step={8} onChange={(v) => resizeNodes([{ id: node.id, height: v }])} onScrubEnd={() => getEditor().breakCoalesce()} />
        </div>
        <Button size="sm" variant="secondary" className="mt-2.5 w-full" onClick={() => getEditor().select(contents())}>
          <BoxSelect size={13} /> Select contents
        </Button>
      </Section>
    </div>
  );
}
