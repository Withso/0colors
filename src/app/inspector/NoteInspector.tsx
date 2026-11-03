// Inspector for a Note node.
import type { NoteNode, NoteTone } from '@/engine/model';
import { updateNodeData } from '../actions';
import { Section, Segmented } from '../ui';
import { AutoTextarea, InspectorHeader, useDraft } from './common';

const TONES: { value: NoteTone; label: string; dot: string }[] = [
  { value: 'neutral', label: 'Gray', dot: 'oklch(0.7 0.01 265)' },
  { value: 'yellow', label: 'Yellow', dot: 'oklch(0.86 0.15 92)' },
  { value: 'blue', label: 'Blue', dot: 'oklch(0.72 0.13 245)' },
  { value: 'green', label: 'Green', dot: 'oklch(0.78 0.14 155)' },
  { value: 'pink', label: 'Pink', dot: 'oklch(0.76 0.13 350)' },
  { value: 'purple', label: 'Purple', dot: 'oklch(0.7 0.14 300)' },
];

export function NoteInspector({ node }: { node: NoteNode }) {
  const text = useDraft(node.data.text, (v) => updateNodeData<NoteNode>(node.id, (d) => { d.text = v; }, `note:${node.id}:text`));
  return (
    <div>
      <InspectorHeader node={node} />
      <Section title="Text">
        <AutoTextarea ariaLabel="Note text" value={text.draft} onChange={text.change} onBlur={text.flush} minRows={5} />
        <p className="num mt-1.5 text-[10.5px] text-fg-3">**bold** · `code` · - list</p>
      </Section>
      <Section title="Color">
        <Segmented
          size="sm"
          value={node.data.tone}
          onChange={(v) => updateNodeData<NoteNode>(node.id, (d) => { d.tone = v; })}
          options={TONES.map((t) => ({
            value: t.value,
            title: t.label,
            label: <span className="mx-auto block h-3 w-3 rounded-full ring-1 ring-inset ring-black/10" style={{ background: t.dot }} />,
          }))}
        />
      </Section>
    </div>
  );
}
