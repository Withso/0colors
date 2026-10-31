// Inspector for a Contrast node: WCAG 2 ratio and APCA Lc for a text/background pair.
import type { ContrastNode } from '@/engine/model';
import type { ContrastResult } from '@/engine/compute';
import { apcaGuidance, wcagGrade } from '@/engine/color/contrast';
import { updateNodeData } from '../actions';
import { useEditor } from '../store';
import { Badge, CommitInput, Section } from '../ui';
import { fmt } from '../lib/color-ui';
import { ColorInputSlot, Explain, InspectorHeader } from './common';

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
      <InspectorHeader node={node} hint="Checks whether text in one color is readable on another." />

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
          <Explain className="mt-1">The text is translucent, so it’s measured as it appears over the background ({result.seen.hex}).</Explain>
        )}
      </Section>

      <Section title="Preview">
        <div className="space-y-1.5 rounded-xl p-3.5 ring-1 ring-inset ring-line" style={{ background: result.bg.hexa, color: result.seen.hex }}>
          <div className="text-[24px] font-bold leading-tight">{data.sample || 'Aa'}</div>
          <div className="text-[16px] leading-snug">{data.sample || 'The quick brown fox'}</div>
          <div className="text-[12px] leading-snug">{data.sample || 'The quick brown fox'} — small print at 12px.</div>
        </div>
        <div className="mt-2">
          <CommitInput aria-label="Sample text" value={data.sample} onCommit={(v) => set('sample', v)} placeholder="Sample text" />
        </div>
      </Section>

      <Section title="WCAG 2">
        <div className="flex items-baseline gap-2">
          <span className="num text-[28px] font-semibold leading-none text-fg">{fmt(result.wcag, 2)}</span>
          <span className="num text-[13px] text-fg-3">: 1</span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <Grade label="AA body" pass={grade.aa} need="4.5" />
          <Grade label="AA large" pass={grade.aaLarge} need="3" />
          <Grade label="AAA body" pass={grade.aaa} need="7" />
          <Grade label="AAA large" pass={grade.aaaLarge} need="4.5" />
        </div>
      </Section>

      <Section title="APCA">
        <div className="flex items-baseline gap-2">
          <span className="num text-[28px] font-semibold leading-none text-fg">Lc {fmt(lc, 1)}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={lcAbs >= 75 ? 'success' : lcAbs >= 45 ? 'warning' : 'danger'}>{apcaGuidance(lc)}</Badge>
          <span className="text-[11px] text-fg-3">{lc === 0 ? 'no measurable contrast' : lc > 0 ? 'dark text on a light background' : 'light text on a dark background'}</span>
        </div>
      </Section>

      <Section title="Why two scores?">
        <Explain>
          <b className="font-medium text-fg-2">WCAG 2</b> compares relative luminance and is the current legal baseline (4.5:1 for body text).
        </Explain>
        <Explain className="mt-1.5">
          <b className="font-medium text-fg-2">APCA</b> (the WCAG 3 candidate) models perception: it treats light-on-dark and dark-on-light
          differently and is stricter with mid-tones.
        </Explain>
        <Explain className="mt-1.5">Swap text and background and watch the WCAG ratio stay put while APCA changes.</Explain>
      </Section>
    </div>
  );
}

function Grade({ label, pass, need }: { label: string; pass: boolean; need: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-2 px-2 py-1.5">
      <span className="text-[11.5px] text-fg-2">{label} <span className="num text-[10.5px] text-fg-3">{need}:1</span></span>
      <Badge tone={pass ? 'success' : 'danger'}>{pass ? 'Pass' : 'Fail'}</Badge>
    </div>
  );
}
