// Inspector for a Contrast node: WCAG 2 ratio and APCA Lc for a text/background pair.
import type { ContrastNode } from '@/engine/model';
import type { ContrastResult } from '@/engine/compute';
import { apcaGuidance, wcagGrade } from '@/engine/color/contrast';
import { updateNodeData } from '../actions';
import { useEditor } from '../store';
import { Badge, CommitInput, Section } from '../ui';
import { fmt } from '../lib/color-ui';
import { ColorInputSlot, InspectorHeader } from './common';

export function ContrastInspector({ node }: { node: ContrastNode }) {
  const result = useEditor((s) => s.result.nodes[node.id]) as ContrastResult | undefined;
  if (!result || result.type !== 'contrast') return null;
  const { data } = node;
  const set = <K extends keyof ContrastNode['data']>(field: K, value: ContrastNode['data'][K]) =>
    updateNodeData<ContrastNode>(node.id, (d) => { d[field] = value as never; }, `contrast:${node.id}:${String(field)}`);
  const grade = wcagGrade(result.wcag);
  const lc = result.apca;
  const lcAbs = Math.abs(lc);

  return (
    <div>
      <InspectorHeader node={node} />

      <Section title="Colors">
        <ColorInputSlot
          label="Text" nodeId={node.id} handle="fg" connected={result.fgConnected} info={result.fg}
          fallbackHex={data.fg} onFallback={(hex) => set('fg', hex)}
        />
        <ColorInputSlot
          label="Background" nodeId={node.id} handle="bg" connected={result.bgConnected} info={result.bg}
          fallbackHex={data.bg} onFallback={(hex) => set('bg', hex)}
        />
        {result.fg.alpha < 1 && (
          <p className="mt-1.5 text-[11px] text-fg-3">Translucent text — measured as seen: <span className="num text-fg-2">{result.seen.hex}</span></p>
        )}
      </Section>

      <Section title="Preview">
        <div
          className="relative space-y-1 overflow-hidden rounded-[10px] px-3.5 py-3 shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.2)]"
          style={{ background: result.bg.hexa, color: result.seen.hex }}
        >
          <div className="truncate text-[22px] font-bold leading-tight tracking-[-0.01em]">{data.sample || 'Aa'}</div>
          <div className="truncate text-[15px] leading-snug">{data.sample || 'The quick brown fox'}</div>
          <div className="truncate text-[12px] leading-snug">{data.sample || 'The quick brown fox'} — small print at 12px.</div>
        </div>
        <div className="mt-2">
          <CommitInput aria-label="Sample text" value={data.sample} onCommit={(v) => set('sample', v)} placeholder="Sample text" />
        </div>
      </Section>

      <Section title="WCAG 2" actions={<span className="num text-[15px] font-semibold text-fg">{fmt(result.wcag, 2)}<span className="text-[12px] font-normal text-fg-3"> : 1</span></span>}>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1.5">
          <span className="text-[11px] text-fg-3" />
          <span className="w-16 text-center text-[10.5px] font-medium text-fg-3">AA</span>
          <span className="w-16 text-center text-[10.5px] font-medium text-fg-3">AAA</span>
          <Grade label="Body text" aa={grade.aa} aaa={grade.aaa} need={['4.5', '7']} />
          <Grade label="Large text" aa={grade.aaLarge} aaa={grade.aaaLarge} need={['3', '4.5']} />
        </div>
      </Section>

      <Section title="APCA" actions={<span className="num text-[15px] font-semibold text-fg">Lc {fmt(lc, 1)}</span>}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={lcAbs >= 75 ? 'success' : lcAbs >= 45 ? 'warning' : 'danger'}>{apcaGuidance(lc)}</Badge>
          <span className="text-[11px] text-fg-3">{lc === 0 ? 'no measurable contrast' : lc > 0 ? 'dark text on a light background' : 'light text on a dark background'}</span>
        </div>
      </Section>

    </div>
  );
}

function Grade({ label, aa, aaa, need }: { label: string; aa: boolean; aaa: boolean; need: [string, string] }) {
  const cell = (pass: boolean, ratio: string) => (
    <span className="flex w-16 justify-center" title={`Needs ${ratio}:1`}>
      <Badge tone={pass ? 'success' : 'danger'}>{pass ? 'Pass' : 'Fail'} <span className="num font-normal opacity-70">{ratio}</span></Badge>
    </span>
  );
  return (
    <>
      <span className="text-[12px] text-fg-2">{label}</span>
      {cell(aa, need[0])}
      {cell(aaa, need[1])}
    </>
  );
}
