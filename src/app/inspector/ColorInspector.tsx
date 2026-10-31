// Inspector for a Color node: rules per channel and a full explanation of the result.
import { useMemo } from 'react';
import { ArrowDown, Link2, TriangleAlert, Unlink } from 'lucide-react';
import type { ColorNode, RuleMode } from '@/engine/model';
import { slugify } from '@/engine/model';
import { type ChannelTrace, type ColorResult, outputColor, outputLabel } from '@/engine/compute';
import {
  type ChannelDef, type ColorInfo, SPACES, SPACE_ORDER, channelDefs, cssColor, formatChannel, round,
} from '@/engine/color/spaces';
import { apcaContrast, apcaGuidance, wcagContrast, wcagGrade } from '@/engine/color/contrast';
import { compositeOver } from '@/engine/color/convert';
import { disconnectInput, setChannelRule, setChannelValue, setColorSpace } from '../actions';
import { getEditor, useEditor } from '../store';
import { Badge, CopyButton, GradientSlider, IconButton, NumberField, Section, Segmented, Tooltip, cn } from '../ui';
import { channelGradient, fmt, inkOn } from '../lib/color-ui';
import { Code, Explain, InspectorHeader, ValueRow, focusNode } from './common';
import { FormulaEditor } from './FormulaEditor';

const PARENT_RULES: { value: RuleMode; label: string; title: string }[] = [
  { value: 'inherit', label: 'Inherit', title: 'Use the parent’s value as is' },
  { value: 'offset', label: 'Offset', title: 'Parent’s value plus a fixed difference' },
  { value: 'fixed', label: 'Fixed', title: 'Own value — ignores the parent' },
  { value: 'formula', label: 'ƒ', title: 'Compute with a formula' },
];
const ROOT_RULES: { value: RuleMode; label: string; title: string }[] = [
  { value: 'fixed', label: 'Value', title: 'A plain value' },
  { value: 'formula', label: 'ƒ', title: 'Compute with a formula' },
];

export function ColorInspector({ node }: { node: ColorNode }) {
  const result = useEditor((s) => s.result.nodes[node.id]) as ColorResult | undefined;
  if (!result || result.type !== 'color') return null;
  const { color } = result;
  const hasParent = !!result.parentId;
  const slug = slugify(node.name);
  const errors = result.channels.filter((c) => c.error).length;

  return (
    <div>
      <InspectorHeader
        node={node}
        hint={
          <span className="flex items-center gap-1">
            Use <Code>@{slug}</Code> in formulas
            <CopyButton text={`@${slug}`} label="Copy reference" />
          </span>
        }
      />

      <Section>
        <div className="checker relative h-24 overflow-hidden rounded-xl ring-1 ring-inset ring-line">
          <div className="absolute inset-0" style={{ background: color.hexa }} />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-2.5" style={{ color: inkOn(color) }}>
            <span className="num text-[15px] font-semibold tracking-tight">{color.hexa}</span>
            <span className="num text-[11px] opacity-80">{cssColor(color, 'oklch')}</span>
          </div>
          <div className="absolute right-1.5 top-1.5 rounded-md bg-black/25 backdrop-blur-sm">
            <CopyButton text={color.hexa} label="Copy hex" className="text-white hover:bg-white/15 hover:text-white" />
          </div>
        </div>
        {!color.inGamut && (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-warning">
            <TriangleAlert size={13} className="mt-px shrink-0" />
            Outside sRGB — showing the closest displayable color.
          </div>
        )}
        {result.warnings.map((w) => (
          <div key={w} className="mt-2 rounded-lg bg-warning/10 px-2.5 py-1.5 text-[11.5px] text-warning">{w}</div>
        ))}
        <div className="mt-2.5 flex items-center gap-2 text-[12px]">
          {hasParent ? (
            <>
              <Link2 size={13} className="shrink-0 text-fg-3" />
              <span className="text-fg-3">Derived from</span>
              <button type="button" onClick={() => focusNode(result.parentId!)} className="min-w-0 truncate font-medium text-fg hover:text-accent">
                {result.parentLabel}
              </button>
              <IconButton label="Disconnect from parent" size="icon-sm" className="ml-auto" onClick={() => disconnectInput(node.id, 'in')}>
                <Unlink size={13} />
              </IconButton>
            </>
          ) : (
            <span className="text-fg-3">Root color — its values are its own. Connect an input to derive it from another color.</span>
          )}
        </div>
        {errors > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-danger">
            <TriangleAlert size={13} /> {errors} formula{errors > 1 ? 's' : ''} need attention below.
          </div>
        )}
      </Section>

      <Section title="Color space">
        <Segmented
          value={node.data.space}
          onChange={(s) => setColorSpace(node.id, s)}
          options={SPACE_ORDER.map((s) => ({ value: s, label: SPACES[s].label }))}
        />
        <Explain className="mt-2">{SPACES[node.data.space].blurb}</Explain>
      </Section>

      <Section title={hasParent ? 'Channels & rules' : 'Channels'}>
        <div className="space-y-4">
          {channelDefs(node.data.space).map((def) => (
            <ChannelEditor key={`${node.data.space}:${def.key}`} node={node} result={result} def={def} hasParent={hasParent} />
          ))}
        </div>
        {hasParent && (
          <Explain className="mt-3">
            <b className="font-medium text-fg-2">Inherit</b> copies the parent, <b className="font-medium text-fg-2">Offset</b> keeps
            a fixed difference, <b className="font-medium text-fg-2">Fixed</b> ignores the parent, and{' '}
            <b className="font-medium text-fg-2">ƒ</b> computes the value with a formula. Dragging an inherited slider turns it into an offset.
          </Explain>
        )}
      </Section>

      <Section title="Every space">
        <ValueRow label="HEX" value={color.hexa} />
        <ValueRow label="RGB" value={cssColor(color, 'rgb')} />
        <ValueRow label="HSL" value={cssColor(color, 'hsl')} />
        <ValueRow label="OKLCH" value={cssColor(color, 'oklch')} />
        <ValueRow label="HCT" value={`hct(${round(color.hct.h, 1)} ${round(color.hct.c, 1)} ${round(color.hct.t, 1)})`} />
        <Explain className="mt-1.5">Same color, five descriptions. Notice how lightness differs between HSL, OKLCH and HCT.</Explain>
      </Section>

      <ContrastSection color={color} />

      <LineageSection node={node} />
    </div>
  );
}

function ChannelEditor({ node, result, def, hasParent }: { node: ColorNode; result: ColorResult; def: ChannelDef; hasParent: boolean }) {
  const trace = result.channels.find((c) => c.key === def.key) as ChannelTrace | undefined;
  const rule = node.data.rules[def.key];
  const mode: RuleMode = rule?.mode ?? 'inherit';
  const shown: RuleMode = hasParent ? mode : mode === 'formula' ? 'formula' : 'fixed';
  const isFormula = mode === 'formula';
  const value = trace?.value ?? node.data.values[def.key] ?? 0;
  const space = node.data.space;
  const valuesKey = JSON.stringify(result.values);
  const gradient = useMemo(() => channelGradient(space, result.values, def.key), [space, valuesKey, def.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const unit = def.unit ?? '';
  const f = (v: number) => `${formatChannel(def, v)}${unit}`;
  const deltaRange = def.wrap ? 180 : def.max - def.min;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Tooltip content={def.hint} side="left">
          <span className="cursor-help text-[12px] font-medium text-fg">
            {def.label} <span className="num text-[11px] text-fg-3">{def.key === 'alpha' ? '' : `.${def.key}`}</span>
          </span>
        </Tooltip>
        <Segmented
          size="sm"
          className="w-auto"
          value={shown}
          onChange={(m) => setChannelRule(node.id, def.key, { mode: m })}
          options={(hasParent ? PARENT_RULES : ROOT_RULES).map((r) => ({ value: r.value, label: r.label, title: r.title }))}
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <GradientSlider
            label={def.label}
            value={value}
            min={def.min}
            max={def.max}
            step={def.step}
            gradient={gradient}
            disabled={isFormula}
            onChange={(v) => setChannelValue(node.id, def.key, v)}
            onCommit={() => getEditor().breakCoalesce()}
          />
        </div>
        <NumberField
          className="w-[76px]"
          value={value}
          min={def.min}
          max={def.max}
          step={def.step}
          decimals={def.decimals}
          suffix={unit || undefined}
          disabled={isFormula}
          onChange={(v) => setChannelValue(node.id, def.key, v)}
          onScrubEnd={() => getEditor().breakCoalesce()}
        />
      </div>

      {trace && !isFormula && (
        <div className="num mt-1.5 flex min-h-5 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-fg-3">
          {trace.mode === 'inherit' && trace.parent !== undefined && (
            <span>= parent <span className="text-fg-2">{f(trace.parent)}</span> · drag to offset</span>
          )}
          {trace.mode === 'offset' && trace.parent !== undefined && (
            <>
              <span>parent <span className="text-fg-2">{f(trace.parent)}</span></span>
              <span>{(trace.delta ?? 0) >= 0 ? '+' : '−'}</span>
              <NumberField
                className="h-6 w-[70px]"
                label="Δ"
                value={trace.delta ?? 0}
                min={-deltaRange}
                max={deltaRange}
                step={def.step}
                decimals={def.decimals}
                onChange={(v) => setChannelRule(node.id, def.key, { mode: 'offset', delta: v })}
                onScrubEnd={() => getEditor().breakCoalesce()}
              />
              <span>→ <span className="text-fg-2">{f(trace.raw)}</span></span>
            </>
          )}
          {trace.mode === 'fixed' && hasParent && (
            <span>fixed at <span className="text-fg-2">{f(trace.value)}</span> · ignores the parent{trace.parent !== undefined ? ` (${f(trace.parent)})` : ''}</span>
          )}
          {trace.adjusted && (
            <span className="text-warning">
              {trace.adjusted === 'wrap' ? `wrapped ${f(trace.raw)} → ${f(trace.value)}` : `clamped ${f(trace.raw)} → ${f(trace.value)}`}
            </span>
          )}
        </div>
      )}

      {isFormula && (
        <FormulaEditor nodeId={node.id} def={def} space={space} trace={trace} hasParent={hasParent} expr={rule?.expr ?? ''} />
      )}
    </div>
  );
}

const WHITE = { r: 1, g: 1, b: 1 };
const BLACK = { r: 0, g: 0, b: 0 };

function ContrastSection({ color }: { color: ColorInfo }) {
  // A translucent color is judged as it would look on a white page.
  const bg = color.alpha < 1 ? compositeOver(color.rgb, color.alpha, WHITE) : color.rgb;
  const rows = [
    { label: 'White text', ink: '#FFFFFF', wcag: wcagContrast(WHITE, bg), apca: apcaContrast(WHITE, bg) },
    { label: 'Black text', ink: '#000000', wcag: wcagContrast(BLACK, bg), apca: apcaContrast(BLACK, bg) },
  ];
  return (
    <Section title="Contrast">
      <div className="space-y-2">
        {rows.map((r) => {
          const grade = wcagGrade(r.wcag);
          return (
            <div key={r.label} className="flex items-center gap-2.5">
              <div
                className="checker relative flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ring-inset ring-line"
                aria-hidden
              >
                <div className="absolute inset-0" style={{ background: color.hexa }} />
                <span className="relative text-[15px] font-semibold" style={{ color: r.ink }}>Aa</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] text-fg-2">{r.label}</span>
                  <span className="num ml-auto text-[12px] font-semibold text-fg">{fmt(r.wcag, 2)}:1</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge tone={grade.aa ? 'success' : grade.aaLarge ? 'warning' : 'danger'}>
                    {grade.aa ? 'AA' : grade.aaLarge ? 'AA large' : 'Fails AA'}
                  </Badge>
                  {grade.aaa && <Badge tone="success">AAA</Badge>}
                  <span className="num ml-auto text-[11px] text-fg-3" title={apcaGuidance(r.apca)}>Lc {fmt(r.apca, 1)}</span>
                </div>
                <div className="mt-0.5 truncate text-right text-[10.5px] text-fg-3">{apcaGuidance(r.apca)}</div>
              </div>
            </div>
          );
        })}
      </div>
      <Explain className="mt-2">
        WCAG 2 needs <b className="font-medium text-fg-2">4.5:1</b> for body text. APCA <b className="font-medium text-fg-2">Lc 75+</b>{' '}
        is its body-text bar and also weighs font size and polarity.
      </Explain>
    </Section>
  );
}

function ruleSummary(node: ColorNode): string {
  const parts: string[] = [];
  for (const def of channelDefs(node.data.space)) {
    const r = node.data.rules[def.key];
    if (!r || r.mode === 'inherit') continue;
    if (r.mode === 'offset') {
      const d = r.delta ?? 0;
      if (Math.abs(d) < 1e-9) continue;
      parts.push(`${def.short} ${d >= 0 ? '+' : '−'}${formatChannel(def, Math.abs(d))}`);
    } else if (r.mode === 'fixed') parts.push(`${def.short} fixed`);
    else parts.push(`${def.short} ƒ`);
  }
  return parts.length ? parts.join(' · ') : 'same as parent';
}

function LineageSection({ node }: { node: ColorNode }) {
  const project = useEditor((s) => s.project);
  const results = useEditor((s) => s.result.nodes);

  const chain = useMemo(() => {
    const items: { id: string; label: string; color: ColorInfo | null; summary: string | null }[] = [];
    let currentId = node.id;
    for (let guard = 0; guard < 12; guard++) {
      const edge = project.edges.find((e) => e.target === currentId && e.targetHandle === 'in');
      if (!edge) break;
      const src = project.nodes.find((n) => n.id === edge.source);
      if (!src || items.some((i) => i.id === src.id)) break;
      items.unshift({
        id: src.id,
        label: outputLabel(src, edge.sourceHandle, results[src.id]),
        color: outputColor(results[src.id], edge.sourceHandle),
        summary: src.type === 'color' && project.edges.some((e) => e.target === src.id && e.targetHandle === 'in') ? ruleSummary(src) : null,
      });
      if (src.type !== 'color' && src.type !== 'palette') break;
      currentId = src.id;
    }
    return items;
  }, [node.id, project, results]);

  const self = results[node.id];
  if (!chain.length) return null;

  return (
    <Section title="Lineage">
      <ol className="space-y-0.5">
        {chain.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => focusNode(item.id)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-surface-3">
              <span className="checker relative h-5 w-5 shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-line">
                <span className="absolute inset-0" style={{ background: item.color?.hexa ?? 'transparent' }} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{item.label}</span>
              {item.summary && <span className="num shrink-0 text-[10.5px] text-fg-3">{item.summary}</span>}
            </button>
            <ArrowDown size={11} className="ml-[13px] text-fg-3" />
          </li>
        ))}
        <li className={cn('flex items-center gap-2 rounded-lg bg-accent-soft px-1.5 py-1')}>
          <span className="checker relative h-5 w-5 shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-line">
            <span className="absolute inset-0" style={{ background: self?.type === 'color' ? self.color.hexa : 'transparent' }} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg">{node.name}</span>
          <span className="num shrink-0 text-[10.5px] text-fg-2">{ruleSummary(node)}</span>
        </li>
      </ol>
      <Explain className="mt-2">Each step only describes how it differs from the step above. Change the root and every descendant follows.</Explain>
    </Section>
  );
}
