// Inspector for a Palette node: scale settings, a lightness chart and the shade list.
import { useMemo } from 'react';
import { Link2, Unlink } from 'lucide-react';
import type { ChromaMode, PaletteCurve, PaletteNaming, PaletteNode } from '@/engine/model';
import type { PaletteResult } from '@/engine/compute';
import { channelDef, SPACES } from '@/engine/color/spaces';
import { wcagContrast } from '@/engine/color/contrast';
import { CURVES, NAMINGS, paletteKeys } from '@/engine/palette';
import { disconnectInput, setPaletteSpace, updateNodeData } from '../actions';
import { useShallow } from 'zustand/react/shallow';
import { getEditor, useEditor } from '../store';
import { CopyButton, FieldRow, GradientSlider, IconButton, NumberField, Section, Segmented, Select, Swatch } from '../ui';
import { channelGradient, fmt } from '../lib/color-ui';
import { Explain, InspectorHeader, focusNode } from './common';

const SPACE_NOTES: Record<PaletteNode['data']['space'], string> = {
  oklch: 'Lightness is OKLCH L (perceptual); chroma is OKLCH C (0–0.4). Even L steps look evenly spaced.',
  hct: 'Lightness is HCT tone (CIE L*); chroma is HCT C. Tone gaps predict contrast: 40+ ≈ 3:1, 50+ ≈ 4.5:1.',
  hsl: 'Lightness is HSL L; “chroma” is HSL saturation. Simple, but steps look uneven across hues.',
};

const WHITE = { r: 1, g: 1, b: 1 };
const BLACK = { r: 0, g: 0, b: 0 };

export function PaletteInspector({ node }: { node: PaletteNode }) {
  const result = useEditor((s) => s.result.nodes[node.id]) as PaletteResult | undefined;
  const input = useEditor(useShallow((s) => {
    const edge = s.project.edges.find((e) => e.target === node.id && e.targetHandle === 'in');
    const src = edge && s.project.nodes.find((n) => n.id === edge.source);
    return { id: src?.id ?? '', name: src?.name ?? '' };
  }));
  const inputSource = input.id ? input : null;
  if (!result || result.type !== 'palette') return null;

  const { data } = node;
  const keys = paletteKeys(data.space);
  const hueDef = channelDef(data.space, keys.h)!;
  const chromaDef = channelDef(data.space, keys.c)!;
  const set = <K extends keyof PaletteNode['data']>(field: K, value: PaletteNode['data'][K]) =>
    updateNodeData<PaletteNode>(node.id, (d) => { d[field] = value as never; }, `palette:${node.id}:${String(field)}`);
  const end = () => getEditor().breakCoalesce();

  const fromInput = result.baseFromInput;
  const baseValues = { [keys.l]: 60, [keys.c]: data.chroma, [keys.h]: data.hue };

  return (
    <div>
      <InspectorHeader node={node} hint="A palette spreads one hue across a lightness scale. Each step has its own output." />

      <Section title="Color space">
        <Segmented
          value={data.space}
          onChange={(s) => setPaletteSpace(node.id, s)}
          options={(['oklch', 'hct', 'hsl'] as const).map((s) => ({ value: s, label: SPACES[s].label }))}
        />
        <Explain className="mt-2">{SPACE_NOTES[data.space]}</Explain>
      </Section>

      <Section title="Base color">
        {fromInput ? (
          <div className="flex h-7 items-center gap-2 text-[12px]">
            <Swatch color={result.base.hexa} className="h-6 w-6 rounded-[6px]" />
            <Link2 size={12} className="shrink-0 text-fg-3" />
            <span className="shrink-0 text-fg-3">Hue and chroma from</span>
            <button
              type="button"
              onClick={() => inputSource && focusNode(inputSource.id)}
              className="min-w-0 truncate rounded-[5px] px-1 font-medium text-fg transition-colors hover:bg-surface-2"
            >
              {inputSource?.name ?? 'input'}
            </button>
            <IconButton label="Disconnect input" size="icon-sm" className="-mr-1.5 ml-auto" onClick={() => disconnectInput(node.id, 'in')}>
              <Unlink size={13} />
            </IconButton>
          </div>
        ) : (
          <div className="space-y-4">
            <BaseChannel
              label="Hue" def={hueDef} value={data.hue}
              gradient={channelGradient(data.space, baseValues, keys.h)}
              onChange={(v) => set('hue', v)} onEnd={end}
            />
            <BaseChannel
              label={data.space === 'hsl' ? 'Saturation' : 'Chroma'} def={chromaDef} value={data.chroma}
              gradient={channelGradient(data.space, baseValues, keys.c)}
              onChange={(v) => set('chroma', v)} onEnd={end}
            />
          </div>
        )}
        {fromInput && (
          <Explain className="mt-2">The input sets hue and chroma; each step’s lightness comes from the curve below.</Explain>
        )}
      </Section>

      <Section title="Scale">
        <FieldRow label="Steps">
          <NumberField value={data.steps} min={2} max={24} step={1} onChange={(v) => set('steps', Math.round(v))} onScrubEnd={end} />
        </FieldRow>
        <FieldRow label="Names">
          <Select<PaletteNaming>
            label="Step names"
            value={data.naming}
            onChange={(v) => set('naming', v)}
            options={(Object.keys(NAMINGS) as PaletteNaming[]).map((k) => ({ value: k, label: NAMINGS[k] }))}
          />
        </FieldRow>
        <FieldRow label="Lightness">
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField label="from" value={data.lightStart} min={0} max={100} step={0.5} decimals={1} onChange={(v) => set('lightStart', v)} onScrubEnd={end} />
            <NumberField label="to" value={data.lightEnd} min={0} max={100} step={0.5} decimals={1} onChange={(v) => set('lightEnd', v)} onScrubEnd={end} />
          </div>
        </FieldRow>
        <FieldRow label="Curve">
          <Select<PaletteCurve>
            label="Lightness curve"
            value={data.curve}
            onChange={(v) => set('curve', v)}
            options={(Object.keys(CURVES) as PaletteCurve[]).map((k) => ({ value: k, label: CURVES[k].label }))}
          />
        </FieldRow>
        <FieldRow label={data.space === 'hsl' ? 'Saturation' : 'Chroma'}>
          <Segmented<ChromaMode>
            size="sm"
            value={data.chromaMode}
            onChange={(v) => set('chromaMode', v)}
            options={[
              { value: 'constant', label: 'Constant', title: 'Same chroma on every step' },
              { value: 'taper', label: 'Taper', title: 'Ease chroma off toward white and black' },
              { value: 'manual', label: 'Manual', title: 'Go from one chroma to another' },
            ]}
          />
        </FieldRow>
        {data.chromaMode === 'manual' && (
          <FieldRow label="">
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField label="from" value={data.chromaStart} min={chromaDef.min} max={chromaDef.max} step={chromaDef.step} decimals={chromaDef.decimals} onChange={(v) => set('chromaStart', v)} onScrubEnd={end} />
              <NumberField label="to" value={data.chromaEnd} min={chromaDef.min} max={chromaDef.max} step={chromaDef.step} decimals={chromaDef.decimals} onChange={(v) => set('chromaEnd', v)} onScrubEnd={end} />
            </div>
          </FieldRow>
        )}
        <FieldRow label="Hue shift" hint="Rotates hue across the scale, centered on the base — e.g. warmer lights, cooler darks.">
          <NumberField value={data.hueShift} min={-90} max={90} step={1} decimals={1} suffix="°" onChange={(v) => set('hueShift', v)} onScrubEnd={end} />
        </FieldRow>
      </Section>

      <Section title="Lightness curve">
        <LightnessChart result={result} lKey={keys.l} cKey={keys.c} chromaMax={chromaDef.max} />
        <Explain className="mt-2">Dots are the steps, bars show chroma. A straight line in OKLCH or HCT means evenly spaced perceived lightness.</Explain>
      </Section>

      <Section title="Shades" actions={<span className="num text-[11px] text-fg-3">{result.shades.length}</span>}>
        <div className="-mx-1.5 mb-0.5 grid grid-cols-[16px_1fr_auto_24px] items-center gap-x-2.5 px-1.5 text-[10.5px] font-medium text-fg-3">
          <span />
          <span>Step</span>
          <span className="w-[92px] text-right">vs white · black</span>
          <span />
        </div>
        <ul className="-mx-1.5">
          {result.shades.map((s) => (
            <li key={s.index} className="group grid h-7 grid-cols-[16px_1fr_auto_24px] items-center gap-x-2.5 rounded-[6px] px-1.5 transition-colors hover:bg-surface-2">
              <Swatch color={s.color.hexa} className="h-4 w-4 rounded-[4px]" />
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="num w-9 shrink-0 text-[12px] font-medium text-fg">{s.name}</span>
                <span className="num truncate text-[11px] text-fg-3">{s.color.hexa}</span>
              </span>
              <span className="num w-[92px] text-right text-[11px] text-fg-2">
                {fmt(wcagContrast(s.color.rgb, WHITE), 1)} · {fmt(wcagContrast(s.color.rgb, BLACK), 1)}
              </span>
              <CopyButton text={s.color.hexa} label="Copy hex" className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function BaseChannel({
  label, def, value, gradient, onChange, onEnd,
}: {
  label: string; def: NonNullable<ReturnType<typeof channelDef>>; value: number; gradient: string;
  onChange: (v: number) => void; onEnd: () => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-medium text-fg">{label}</div>
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <GradientSlider label={label} value={value} min={def.min} max={def.max} step={def.step} gradient={gradient} onChange={onChange} onCommit={onEnd} />
        </div>
        <NumberField className="w-[72px]" value={value} min={def.min} max={def.max} step={def.step} decimals={def.decimals} suffix={def.unit} onChange={onChange} onScrubEnd={onEnd} />
      </div>
    </div>
  );
}

function LightnessChart({ result, lKey, cKey, chromaMax }: { result: PaletteResult; lKey: string; cKey: string; chromaMax: number }) {
  const W = 300;
  const H = 96;
  const pad = 8;
  const pts = useMemo(() => {
    const n = result.shades.length;
    const maxC = Math.max(chromaMax * 0.25, ...result.shades.map((s) => s.values[cKey] ?? 0));
    return result.shades.map((s, i) => ({
      x: pad + (n === 1 ? 0 : (i / (n - 1)) * (W - pad * 2)),
      y: pad + (1 - (s.values[lKey] ?? 0) / 100) * (H - pad * 2),
      c: ((s.values[cKey] ?? 0) / maxC) * 22,
      hex: s.color.hex,
      name: s.name,
      l: s.values[lKey] ?? 0,
    }));
  }, [result, lKey, cKey, chromaMax]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-24 w-full overflow-visible rounded-[10px] bg-surface-2" role="img" aria-label="Lightness of each palette step">
      {[25, 50, 75].map((l) => (
        <line key={l} x1={pad} x2={W - pad} y1={pad + (1 - l / 100) * (H - pad * 2)} y2={pad + (1 - l / 100) * (H - pad * 2)} stroke="var(--app-line)" strokeDasharray="2 3" />
      ))}
      {pts.map((p) => (
        <rect key={`c${p.name}`} x={p.x - 3} y={H - pad - p.c} width={6} height={Math.max(0.5, p.c)} rx={1.5} fill={p.hex} opacity={0.55} />
      ))}
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--app-fg-3)" strokeWidth={1.25} />
      {pts.map((p) => (
        <circle key={p.name} cx={p.x} cy={p.y} r={4} fill={p.hex} stroke="var(--app-surface)" strokeWidth={1.5}>
          <title>{`${p.name}: ${fmt(p.l, 1)}`}</title>
        </circle>
      ))}
    </svg>
  );
}
