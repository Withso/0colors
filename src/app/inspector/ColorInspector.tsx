// Inspector for a Color node: rules per channel and a full explanation of the result.
import { useMemo } from 'react';
import { Link2, TriangleAlert, Unlink } from 'lucide-react';
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
import { channelGradient, fmt } from '../lib/color-ui';
import { Callout, Code, Explain, HeroSwatch, InspectorHeader, ValueRow, focusNode } from './common';
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
            <CopyButton text={`@${slug}`} label="Copy reference" className="h-5 w-5" />
          </span>
        }
      />

      <Section>
        <HeroSwatch color={color} detail={cssColor(color, 'oklch')} />
        {!color.inGamut && (
          <Callout className="mt-2">Outside sRGB — showing the closest color a standard screen can display.</Callout>
        )}
        {result.warnings.map((w) => <Callout key={w} className="mt-2">{w}</Callout>)}

        <div className="mt-2.5 flex h-7 items-center gap-1.5 text-[12px]">
          {hasParent ? (
            <>
              <Link2 size={13} className="shrink-0 text-fg-3" />
              <span className="shrink-0 text-fg-3">Derived from</span>
              <button
                type="button"
                onClick={() => focusNode(result.parentId!)}
                className="min-w-0 truncate rounded-[5px] px-1 font-medium text-fg transition-colors hover:bg-surface-2"
              >
                {result.parentLabel}
              </button>
              <IconButton label="Disconnect from parent" size="icon-sm" className="-mr-1.5 ml-auto" onClick={() => disconnectInput(node.id, 'in')}>
                <Unlink size={13} />
              </IconButton>
            </>
          ) : (
            <span className="text-[11px] leading-relaxed text-fg-3">Root color — its values are its own. Connect an input to derive it from another color.</span>
          )}
        </div>
        {errors > 0 && (
          <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-danger">
            <TriangleAlert size={13} /> {errors === 1 ? '1 formula needs' : `${errors} formulas need`} attention below.
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

      <Section title={hasParent ? 'Channels and rules' : 'Channels'}>
        <div className="space-y-4">
          {channelDefs(node.data.space).map((def) => (
            <ChannelEditor key={`${node.data.space}:${def.key}`} node={node} result={result} def={def} hasParent={hasParent} />
          ))}
        </div>
        {hasParent && (
          <Explain className="mt-3.5">
            <b className="font-medium text-fg-2">Inherit</b> copies the parent, <b className="font-medium text-fg-2">Offset</b> keeps
            a fixed difference, <b className="font-medium text-fg-2">Fixed</b> ignores the parent, and{' '}
            <b className="font-medium text-fg-2">ƒ</b> computes the value with a formula. Dragging an inherited slider turns it into an offset.
          </Explain>
        )}
      </Section>

      <Section title="Values">
        <ValueRow label="HEX" value={color.hexa} />
        <ValueRow label="RGB" value={cssColor(color, 'rgb')} />
        <ValueRow label="HSL" value={cssColor(color, 'hsl')} />
        <ValueRow label="OKLCH" value={cssColor(color, 'oklch')} />
        <ValueRow label="HCT" value={`hct(${round(color.hct.h, 1)} ${round(color.hct.c, 1)} ${round(color.hct.t, 1)})`} />
        <Explain className="mt-2">Same color, five descriptions. Notice how “lightness” differs between HSL, OKLCH and HCT.</Explain>
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
      <div className="mb-2 flex h-6 items-center justify-between gap-2">
        <Tooltip content={def.hint} side="left">
          <span className="flex min-w-0 cursor-help items-baseline gap-1 truncate text-[12px] font-medium text-fg">
            {def.label}
            {def.key !== 'alpha' && <span className="num text-[10.5px] font-normal text-fg-3">.{def.key}</span>}
          </span>
        </Tooltip>
        <Segmented
          size="sm"
          className="w-auto shrink-0"
          value={shown}
          onChange={(m) => setChannelRule(node.id, def.key, { mode: m })}
          options={(hasParent ? PARENT_RULES : ROOT_RULES).map((r) => ({ value: r.value, label: r.label, title: r.title }))}
        />
      </div>
      <div className="flex items-center gap-2.5">
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
          className="w-[72px]"
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

      {trace && !isFormula && (trace.mode !== 'root' || trace.adjusted) && (
        <div className="num mt-1.5 flex min-h-5 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-fg-3">
          {trace.mode === 'inherit' && trace.parent !== undefined && (
            <span>= parent <span className="text-fg-2">{f(trace.parent)}</span> · drag to offset</span>
          )}
          {trace.mode === 'offset' && trace.parent !== undefined && (
            <>
              <span>parent <span className="text-fg-2">{f(trace.parent)}</span></span>
              <span>+</span>
              <NumberField
                className="h-6 w-[68px]"
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
      <div className="mb-1 grid grid-cols-[36px_1fr_auto_44px_52px] items-center gap-x-2 text-[10.5px] font-medium text-fg-3">
        <span />
        <span />
        <span className="text-right">WCAG</span>
        <span />
        <span className="text-right">APCA</span>
      </div>
      <div className="space-y-1">
        {rows.map((r) => {
          const grade = wcagGrade(r.wcag);
          return (
            <div key={r.label} className="grid grid-cols-[36px_1fr_auto_44px_52px] items-center gap-x-2">
              <div className="checker relative flex h-7 w-9 items-center justify-center overflow-hidden rounded-[6px]" aria-hidden>
                <div className="absolute inset-0" style={{ background: color.hexa }} />
                <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.2)]" />
                <span className="relative text-[13px] font-semibold" style={{ color: r.ink }}>Aa</span>
              </div>
              <span className="truncate text-[12px] text-fg-2">{r.label}</span>
              <span className="num text-right text-[12px] font-medium text-fg">{fmt(r.wcag, 2)}:1</span>
              <span className="flex justify-start">
                <Badge tone={grade.aaa ? 'success' : grade.aa ? 'success' : grade.aaLarge ? 'warning' : 'danger'}>
                  {grade.aaa ? 'AAA' : grade.aa ? 'AA' : grade.aaLarge ? 'AA·L' : 'Fail'}
                </Badge>
              </span>
              <Tooltip content={apcaGuidance(r.apca)} side="left">
                <span className="num cursor-help text-right text-[11.5px] text-fg-2">Lc {fmt(r.apca, 0)}</span>
              </Tooltip>
            </div>
          );
        })}
      </div>
      <Explain className="mt-2.5">
        WCAG 2 needs <b className="font-medium text-fg-2">4.5:1</b> for body text (AA·L = large text only). APCA{' '}
        <b className="font-medium text-fg-2">Lc 75+</b> is its body-text bar and also weighs font size and polarity.
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

  const dot = (hexa: string | undefined) => (
    <span className="checker relative z-10 h-4 w-4 shrink-0 overflow-hidden rounded-[4px]">
      <span className="absolute inset-0" style={{ background: hexa ?? 'transparent' }} />
      <span className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.25)]" />
    </span>
  );

  return (
    <Section title="Lineage">
      <ol className="relative -mx-1.5">
        {/* The connector line runs behind the swatches. */}
        <span aria-hidden className="absolute bottom-3.5 left-[13.5px] top-3.5 w-px bg-line-strong" />
        {chain.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => focusNode(item.id)}
              className="flex h-7 w-full items-center gap-2.5 rounded-[6px] px-1.5 text-left transition-colors hover:bg-surface-2"
            >
              {dot(item.color?.hexa)}
              <span className="min-w-0 flex-1 truncate text-[12px] text-fg-2">{item.label}</span>
              {item.summary && <span className="num shrink-0 text-[10.5px] text-fg-3">{item.summary}</span>}
            </button>
          </li>
        ))}
        <li className={cn('flex h-7 items-center gap-2.5 rounded-[6px] bg-surface-2 px-1.5')}>
          {dot(self?.type === 'color' ? self.color.hexa : undefined)}
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg">{node.name}</span>
          <span className="num shrink-0 text-[10.5px] text-fg-2">{ruleSummary(node)}</span>
        </li>
      </ol>
      <Explain className="mt-2">Each step only describes how it differs from the one above. Change the root and every descendant follows.</Explain>
    </Section>
  );
}
