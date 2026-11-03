// Inspector for a Mix node: the same two colors blended in different spaces.
import type { MixNode, MixSpace } from '@/engine/model';
import type { MixResult } from '@/engine/compute';
import { MIX_SPACES, mixRgb, mixStops } from '@/engine/color/mix';
import { toHex } from '@/engine/color/convert';
import { updateNodeData } from '../actions';
import { getEditor, useEditor } from '../store';
import { Check } from 'lucide-react';
import { GradientSlider, NumberField, Section, Segmented, Swatch, cn } from '../ui';
import { ColorInputSlot, HeroSwatch, InspectorHeader } from './common';

const ORDER: MixSpace[] = ['oklab', 'oklch', 'srgb', 'linear', 'hsl'];

function stripGradient(a: MixResult['a'], b: MixResult['b'], space: MixSpace): string {
  const stops = mixStops(a.rgb, b.rgb, space, 9);
  return `linear-gradient(to right, ${stops.map((c, i) => `${toHex(c)} ${(i / 8) * 100}%`).join(', ')})`;
}

export function MixInspector({ node }: { node: MixNode }) {
  const result = useEditor((s) => s.result.nodes[node.id]) as MixResult | undefined;
  if (!result || result.type !== 'mix') return null;
  const { data } = node;
  const set = <K extends keyof MixNode['data']>(field: K, value: MixNode['data'][K]) =>
    updateNodeData<MixNode>(node.id, (d) => { d[field] = value as never; }, `mix:${node.id}:${String(field)}`);
  const end = () => getEditor().breakCoalesce();

  return (
    <div>
      <InspectorHeader node={node} />

      <Section>
        <HeroSwatch color={result.color} detail={`${Math.round((1 - data.ratio) * 100)}% A · ${Math.round(data.ratio * 100)}% B`} />
      </Section>

      <Section title="Inputs">
        <ColorInputSlot
          label="A" nodeId={node.id} handle="a" connected={result.aConnected} info={result.a}
          fallbackHex={data.a} onFallback={(hex) => set('a', hex)}
        />
        <ColorInputSlot
          label="B" nodeId={node.id} handle="b" connected={result.bConnected} info={result.b}
          fallbackHex={data.b} onFallback={(hex) => set('b', hex)}
        />
      </Section>

      <Section title="Mix">
        <Segmented
          size="sm"
          value={data.space}
          onChange={(v) => set('space', v)}
          options={ORDER.map((s) => ({ value: s, label: MIX_SPACES[s].label, title: MIX_SPACES[s].blurb }))}
        />
        <div className="mt-3 flex items-center gap-2">
          <span className="w-3 text-[11px] font-medium text-fg-3">A</span>
          <div className="min-w-0 flex-1">
            <GradientSlider
              label="Ratio"
              value={data.ratio * 100}
              min={0}
              max={100}
              step={1}
              gradient={stripGradient(result.a, result.b, data.space)}
              onChange={(v) => set('ratio', v / 100)}
              onCommit={end}
            />
          </div>
          <span className="w-3 text-[11px] font-medium text-fg-3">B</span>
          <NumberField
            className="w-[64px]"
            value={data.ratio * 100}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) => set('ratio', v / 100)}
            onScrubEnd={end}
          />
        </div>
        <div className="num mt-1.5 pl-5 text-[11px] text-fg-3">{Math.round((1 - data.ratio) * 100)}% A + {Math.round(data.ratio * 100)}% B</div>
      </Section>

      <Section title="Compare spaces">
        <ul className="-mx-1.5 space-y-0.5">
          {ORDER.map((space) => {
            const midpoint = toHex(mixRgb(result.a.rgb, result.b.rgb, data.ratio, space).rgb);
            const active = space === data.space;
            return (
              <li key={space}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => set('space', space)}
                  className={cn('block w-full rounded-[8px] px-1.5 pb-2 pt-1.5 text-left transition-colors', active ? 'bg-surface-2' : 'hover:bg-surface-2/70')}
                >
                  <div className="mb-1.5 flex h-4 items-center justify-between">
                    <span className={cn('flex items-center gap-1.5 text-[12px]', active ? 'font-medium text-fg' : 'text-fg-2')}>
                      {active && <Check size={12} className="text-accent" />}
                      {MIX_SPACES[space].label}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Swatch color={midpoint} className="h-3 w-3 rounded-[3px]" />
                      <span className="num text-[11px] text-fg-3">{midpoint}</span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.2)]" style={{ background: stripGradient(result.a, result.b, space) }} />
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
