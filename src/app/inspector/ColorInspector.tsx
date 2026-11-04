// Inspector for a Color node: the color, its channels with one small rule control each,
// formats, contrast and lineage. Explanations live in the demo canvas, not here.
import { Suspense, lazy, useEffect, useMemo, useRef } from 'react';
import { Check, ChevronDown, Lock, Link2, Pipette, TriangleAlert, Unlink } from 'lucide-react';
import type { ColorNode, RuleMode } from '@/engine/model';
import { slugify } from '@/engine/model';
import { type ChannelTrace, type ColorResult, outputColor, outputLabel } from '@/engine/compute';
import {
  type ChannelDef, type ColorInfo, SPACES, SPACE_ORDER, channelDefs, cssColor, formatChannel, round,
} from '@/engine/color/spaces';
import { apcaContrast, apcaGuidance, wcagContrast, wcagGrade } from '@/engine/color/contrast';
import { compositeOver } from '@/engine/color/convert';
import { disconnectInput, setChannelRule, setChannelValue, setColorHex, setColorSpace } from '../actions';
import { getEditor, useEditor } from '../store';
import {
  Badge, CopyButton, GradientSlider, IconButton, Menu, MenuContent, MenuItem, MenuTrigger, NumberField, Section, Segmented, Tooltip, cn,
} from '../ui';
import { channelGradient, fmt } from '../lib/color-ui';
import { HeroSwatch, HexInput, InspectorHeader, ValueRow, focusNode } from './common';
import { ColorPlane } from './ColorPlane';

// The formula editor (and CodeMirror) is its own chunk, fetched right after startup so it's ready when needed.
const loadFormulaEditor = () => import('./FormulaEditor');
const FormulaEditor = lazy(() => loadFormulaEditor().then((m) => ({ default: m.FormulaEditor })));
if (typeof window !== 'undefined') setTimeout(() => void loadFormulaEditor(), 0);

const RULES: { value: RuleMode; label: string; hint: string }[] = [
  { value: 'inherit', label: 'Inherit', hint: 'Same as the parent' },
  { value: 'offset', label: 'Offset', hint: 'Parent plus an amount' },
  { value: 'fixed', label: 'Fixed', hint: 'Own value, ignores the parent' },
  { value: 'formula', label: 'Formula', hint: 'Compute it with logic' },
];

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

export function ColorInspector({ node }: { node: ColorNode }) {
  const result = useEditor((s) => s.result.nodes[node.id]) as ColorResult | undefined;
  if (!result || result.type !== 'color') return null;
  const { color } = result;
  const hasParent = !!result.parentId;
  const slug = slugify(node.name);
  const alpha = result.channels.find((c) => c.key === 'alpha');
  const alphaRule = node.data.rules.alpha?.mode;
  const showAlphaRow = (alpha?.value ?? 100) < 100 || alphaRule === 'formula' || (hasParent && !!alphaRule && alphaRule !== 'inherit');
  const eyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;

  return (
    <div>
      <InspectorHeader
        node={node}
        hint={
          <span className="flex items-center gap-0.5">
            <span className="num text-fg-2">@{slug}</span>
            <CopyButton text={`@${slug}`} label="Copy formula reference" className="h-5 w-5" />
          </span>
        }
      />

      <Section>
        <HeroSwatch color={color} detail={cssColor(color, 'oklch')} height={60} />
        <div className="mt-2 flex items-center gap-1.5">
          <HexInput value={color.hexa} onCommit={(hex) => setColorHex(node.id, hex)} className="min-w-0 flex-1" />
          <NumberField
            className="w-[68px]"
            value={alpha?.value ?? 100}
            min={0}
            max={100}
            step={1}
            suffix="%"
            disabled={alphaRule === 'formula'}
            onChange={(v) => setChannelValue(node.id, 'alpha', v)}
            onScrubEnd={() => getEditor().breakCoalesce()}
          />
          {eyeDropper && (
            <IconButton
              label="Pick a color from the screen"
              size="icon-sm"
              onClick={() => {
                new eyeDropper().open().then((r) => setColorHex(node.id, r.sRGBHex), () => undefined);
              }}
            >
              <Pipette size={13} />
            </IconButton>
          )}
        </div>

        <ColorPlane node={node} result={result} />

        {hasParent && (
          <div className="mt-2 flex h-7 items-center gap-1.5 text-[12px]">
            <Link2 size={13} className="shrink-0 text-fg-3" />
            <span className="shrink-0 text-fg-3">From</span>
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
          </div>
        )}
        {(!color.inGamut || result.warnings.length > 0) && (
          <div className="mt-2 space-y-1">
            {!color.inGamut && (
              <Tooltip content="Outside the sRGB gamut — the swatch shows the closest color a standard screen can display.">
                <span className="flex w-fit cursor-help items-center gap-1.5 text-[11.5px] text-fg-2">
                  <TriangleAlert size={12} className="text-warning" /> Outside sRGB
                </span>
              </Tooltip>
            )}
            {result.warnings.map((w) => (
              <span key={w} className="flex items-center gap-1.5 text-[11.5px] text-fg-2"><TriangleAlert size={12} className="text-warning" /> {w}</span>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Channels"
        actions={
          <Segmented
            size="sm"
            className="w-auto"
            value={node.data.space}
            onChange={(s) => setColorSpace(node.id, s)}
            options={SPACE_ORDER.map((s) => ({ value: s, label: SPACES[s].label, title: SPACES[s].blurb }))}
          />
        }
      >
        <div className="space-y-3.5">
          {channelDefs(node.data.space)
            .filter((def) => def.key !== 'alpha' || showAlphaRow)
            .map((def) => (
              <ChannelEditor key={`${node.data.space}:${def.key}`} node={node} result={result} def={def} hasParent={hasParent} />
            ))}
        </div>
      </Section>

      <Section title="Formats">
        <ValueRow label="HEX" value={color.hexa} />
        <ValueRow label="RGB" value={cssColor(color, 'rgb')} />
        <ValueRow label="HSL" value={cssColor(color, 'hsl')} />
        <ValueRow label="OKLCH" value={cssColor(color, 'oklch')} />
        <ValueRow label="HCT" value={`hct(${round(color.hct.h, 1)} ${round(color.hct.c, 1)} ${round(color.hct.t, 1)})`} />
      </Section>

      <ContrastSection color={color} />

      <LineageSection node={node} />
    </div>
  );
}

function RuleMenu({ mode, delta, def, onPick }: { mode: RuleMode; delta?: number; def: ChannelDef; onPick: (m: RuleMode) => void }) {
  const label = mode === 'offset'
    ? `${(delta ?? 0) >= 0 ? '+' : '−'}${formatChannel(def, Math.abs(delta ?? 0))}`
    : mode === 'formula' ? 'ƒ Formula' : RULES.find((r) => r.value === mode)!.label;
  return (
    <Menu>
      <Tooltip content={RULES.find((r) => r.value === mode)?.hint}>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label={`${def.label} rule: ${label}`}
            className={cn(
              'flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[11px] font-medium outline-none transition-colors',
              'hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent/60 data-[state=open]:bg-surface-3',
              mode === 'inherit' ? 'text-fg-3' : mode === 'formula' ? 'text-(--app-syn-fn)' : mode === 'offset' ? 'num text-accent' : 'text-fg-2',
            )}
          >
            {mode === 'inherit' && <Link2 size={11} />}
            {mode === 'fixed' && <Lock size={10} />}
            {mode === 'offset' && <Link2 size={11} />}
            {label}
            <ChevronDown size={10} className="opacity-60" />
          </button>
        </MenuTrigger>
      </Tooltip>
      <MenuContent align="end" className="w-60" keepFocus>
        {RULES.map((r) => (
          <MenuItem key={r.value} icon={r.value === mode ? <Check size={13} /> : <span className="w-3.5" />} onSelect={() => onPick(r.value)}>
            <span className="flex items-baseline gap-2">
              <span>{r.value === 'formula' ? 'ƒ Formula' : r.label}</span>
              <span className="truncate text-[11px] opacity-60">{r.hint}</span>
            </span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
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
  const justSwitched = useRef(false);
  // Only the render right after picking "Formula" opens the editor straight into typing.
  useEffect(() => { justSwitched.current = false; });
  const pick = (m: RuleMode) => {
    if (m === 'formula' && mode !== 'formula') justSwitched.current = true;
    setChannelRule(node.id, def.key, { mode: m });
  };

  return (
    <div data-channel={def.key}>
      <div className="mb-1.5 flex h-6 items-center gap-1.5">
        <Tooltip content={def.hint} side="left">
          <span className="cursor-help text-[12px] font-medium text-fg">{def.label}</span>
        </Tooltip>
        {def.key !== 'alpha' && <span className="num text-[10.5px] text-fg-3">.{def.key}</span>}
        <span className="flex-1" />
        {hasParent ? (
          <RuleMenu mode={shown} delta={trace?.delta} def={def} onPick={pick} />
        ) : (
          <Tooltip content={isFormula ? 'Back to a plain value' : 'Compute this channel with a formula'}>
            <button
              type="button"
              aria-pressed={isFormula}
              aria-label={isFormula ? `Stop using a formula for ${def.label}` : `Use a formula for ${def.label}`}
              onClick={() => pick(isFormula ? 'fixed' : 'formula')}
              className={cn(
                'flex h-6 min-w-6 items-center justify-center gap-1 rounded-[6px] px-1.5 text-[11.5px] font-semibold outline-none transition-colors',
                'focus-visible:ring-2 focus-visible:ring-accent/60',
                isFormula ? 'bg-surface-3 text-(--app-syn-fn)' : 'text-fg-3 hover:bg-surface-3 hover:text-fg',
              )}
            >
              ƒ{isFormula && <span className="text-[11px] font-medium">Formula</span>}
            </button>
          </Tooltip>
        )}
      </div>

      {isFormula ? (
        <Suspense fallback={<div className="mt-2 h-[38px] rounded-[8px] bg-surface-2" />}>
          <FormulaEditor
            key={`${node.id}:${def.key}`}
            nodeId={node.id}
            def={def}
            space={space}
            trace={trace}
            hasParent={hasParent}
            expr={rule?.expr ?? ''}
            autoFocus={justSwitched.current}
          />
        </Suspense>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <GradientSlider
                label={def.label}
                value={value}
                min={def.min}
                max={def.max}
                step={def.step}
                gradient={gradient}
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
              onChange={(v) => setChannelValue(node.id, def.key, v)}
              onScrubEnd={() => getEditor().breakCoalesce()}
            />
          </div>
          {trace && (trace.mode === 'offset' || trace.adjusted) && (
            <div className="num mt-1.5 flex min-h-5 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-fg-3">
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
                </>
              )}
              {trace.adjusted && (
                <span className="text-warning">
                  {trace.adjusted === 'wrap' ? `wrapped from ${f(trace.raw)}` : `clamped from ${f(trace.raw)}`}
                </span>
              )}
            </div>
          )}
        </>
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
      <div className="space-y-1">
        {rows.map((r) => {
          const grade = wcagGrade(r.wcag);
          return (
            <div key={r.label} className="grid grid-cols-[36px_1fr_auto_40px_48px] items-center gap-x-2">
              <div className="checker relative flex h-7 w-9 items-center justify-center overflow-hidden rounded-[6px]" aria-hidden>
                <div className="absolute inset-0" style={{ background: color.hexa }} />
                <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.2)]" />
                <span className="relative text-[13px] font-semibold" style={{ color: r.ink }}>Aa</span>
              </div>
              <span className="truncate text-[12px] text-fg-2">{r.label}</span>
              <span className="num text-right text-[12px] font-medium text-fg">{fmt(r.wcag, 2)}:1</span>
              <span className="flex justify-start">
                <Tooltip content="WCAG 2: AA needs 4.5:1 for body text (3:1 large); AAA needs 7:1.">
                  <span>
                    <Badge tone={grade.aaa ? 'success' : grade.aa ? 'success' : grade.aaLarge ? 'warning' : 'danger'}>
                      {grade.aaa ? 'AAA' : grade.aa ? 'AA' : grade.aaLarge ? 'AA·L' : 'Fail'}
                    </Badge>
                  </span>
                </Tooltip>
              </span>
              <Tooltip content={apcaGuidance(r.apca)} side="left">
                <span className="num cursor-help text-right text-[11.5px] text-fg-2">Lc {fmt(r.apca, 0)}</span>
              </Tooltip>
            </div>
          );
        })}
      </div>
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
    </Section>
  );
}
