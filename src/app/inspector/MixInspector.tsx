// Inspector for a Mix node: the same two colors blended in different spaces.
import type { MixNode, MixSpace } from '@/engine/model';
import type { MixResult } from '@/engine/compute';
import { MIX_SPACES, mixRgb, mixStops } from '@/engine/color/mix';
import { toHex } from '@/engine/color/convert';
import { updateNodeData } from '../actions';
import { getEditor, useEditor } from '../store';
import { CopyButton, GradientSlider, NumberField, Section, Segmented, cn } from '../ui';
import { ColorInputSlot, Explain, InspectorHeader } from './common';

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
      <InspectorHeader node={node} hint="Blends input A into input B. The space you mix in changes the path between them." />

      <Section>
        <div className="checker relative h-16 overflow-hidden rounded-xl ring-1 ring-inset ring-line">
          <div className="absolute inset-0" style={{ background: result.color.hexa }} />
          <div className="absolute bottom-2 left-2.5 rounded-md bg-black/30 px-1.5 py-0.5 backdrop-blur-sm">
            <span className="num text-[12px] font-semibold text-white">{result.color.hexa}</span>
          </div>
          <div className="absolute right-1.5 top-1.5 rounded-md bg-black/25 backdrop-blur-sm">
            <CopyButton text={result.color.hexa} label="Copy hex" className="text-white hover:bg-white/15 hover:text-white" />
          </div>
        </div>
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
        <Explain className="mt-1">Connect colors from the canvas, or type fallback hex values.</Explain>
      </Section>

      <Section title="Mix">
        <Segmented
          size="sm"
          value={data.space}
          onChange={(v) => set('space', v)}
          options={ORDER.map((s) => ({ value: s, label: MIX_SPACES[s].label }))}
        />
        <Explain className="mt-2">{MIX_SPACES[data.space].blurb}</Explain>
        <div className="mt-3 flex items-center gap-2">
          <span className="w-8 text-xs text-fg-2">A</span>
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
          <span className="w-3 text-xs text-fg-2">B</span>
          <NumberField
            className="w-[68px]"
            value={data.ratio * 100}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) => set('ratio', v / 100)}
            onScrubEnd={end}
          />
        </div>
        <div className="num mt-1.5 text-[11px] text-fg-3">{Math.round((1 - data.ratio) * 100)}% A + {Math.round(data.ratio * 100)}% B</div>
      </Section>

      <Section title="Compare spaces">
        <ul className="space-y-2.5">
          {ORDER.map((space) => {
            const midpoint = toHex(mixRgb(result.a.rgb, result.b.rgb, data.ratio, space).rgb);
            const active = space === data.space;
            return (
              <li key={space}>
                <button
                  type="button"
                  onClick={() => set('space', space)}
                  className={cn('block w-full rounded-lg p-1.5 text-left transition-colors', active ? 'bg-accent-soft' : 'hover:bg-surface-2')}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={cn('text-[12px] font-medium', active ? 'text-accent' : 'text-fg')}>{MIX_SPACES[space].label}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-[3px] ring-1 ring-inset ring-line" style={{ background: midpoint }} />
                      <span className="num text-[11px] text-fg-3">{midpoint}</span>
                    </span>
                  </div>
                  <div className="h-4 rounded-md ring-1 ring-inset ring-line" style={{ background: stripGradient(result.a, result.b, space) }} />
                </button>
              </li>
            );
          })}
        </ul>
        <Explain className="mt-2">
          Same two colors, five paths. Perceptual spaces (OKLab, OKLCH) keep the middle bright and even; sRGB and linear RGB can
          dip into gray or wash out.
        </Explain>
      </Section>
    </div>
  );
}
