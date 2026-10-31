// ─────────────────────────────────────────────────────────────
// Tokens panel: every semantic token resolved in every theme, plus the
// primitives (palettes, colors, mixes) they can point at.
// ─────────────────────────────────────────────────────────────
import { useDeferredValue, useMemo, useState } from 'react';
import { ChevronRight, Tag } from 'lucide-react';
import type { CanvasNode, TokenNode } from '@/engine/model';
import { type ComputeResult, type TokenResult, computeAllThemes, outputColor } from '@/engine/compute';
import { useEditor } from '../store';
import { Kbd, Section, Swatch, Tooltip, cn } from '../ui';
import { focusNode } from './download';

function TokenValue({ result, primaryName, compact }: { result: TokenResult | undefined; primaryName: string; compact: boolean }) {
  const color = result?.color ?? null;
  const hex = color?.hexa ?? null;
  const title = !color ? 'Not connected in this theme' : result?.inherited ? `${hex} · falls back to ${primaryName}` : hex ?? '';
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={title}>
      {result?.inherited && <span className="text-[11px] leading-none text-fg-3" aria-label={`falls back to ${primaryName}`}>↳</span>}
      <Swatch color={hex} className="h-4 w-4 rounded" />
      {!compact && <span className={cn('num truncate text-[11px]', color ? 'text-fg-2' : 'text-fg-3')}>{hex ?? '—'}</span>}
    </span>
  );
}

export function TokensPanel() {
  const liveProject = useEditor((s) => s.project);
  const project = useDeferredValue(liveProject);
  const themeId = useEditor((s) => s.themeId);
  const selection = useEditor((s) => s.selection);
  const all = useMemo(() => computeAllThemes(project), [project]);
  const [showPrimitives, setShowPrimitives] = useState(true);

  const themes = project.themes;
  const primary = themes[0];
  const compact = themes.length > 2;
  const tokens = project.nodes.filter((n): n is TokenNode => n.type === 'token');
  const active: ComputeResult | undefined = all[themeId] ?? all[primary?.id ?? ''];
  const primitives = project.nodes.filter((n) => n.type === 'palette' || n.type === 'color' || n.type === 'mix');
  const gridCols = { gridTemplateColumns: `minmax(0, 1fr) repeat(${themes.length}, ${compact ? '28px' : '78px'})` };

  return (
    <div>
      <Section
        title="Tokens"
        actions={<span className="num text-[11px] text-fg-3">{tokens.length}</span>}
      >
        {tokens.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface-2 p-3.5 text-xs leading-relaxed text-fg-2">
            <div className="mb-1.5 flex items-center gap-2 font-medium text-fg">
              <Tag size={14} className="text-accent" /> No tokens yet
            </div>
            <p>
              Tokens are semantic names like <code className="num text-fg">bg/surface</code> or{' '}
              <code className="num text-fg">text/primary</code> that point at primitives. Each token has one input per theme,
              so the same name can be light in Light and dark in Dark.
            </p>
            <p className="mt-2">
              Press <Kbd>T</Kbd> or use the toolbar to add one, then drag a palette shade into its theme input.
            </p>
          </div>
        ) : (
          <div className="-mx-1">
            <div className="grid items-center gap-2 px-1 pb-1.5 text-[11px] font-medium text-fg-3" style={gridCols}>
              <span>Name</span>
              {themes.map((t) => (
                <span key={t.id} className={cn('truncate', t.id === themeId && 'text-fg')} title={t.name}>
                  {compact ? t.name.slice(0, 2) : t.name}
                </span>
              ))}
            </div>
            <ul className="flex flex-col">
              {tokens.map((token) => {
                const activeResult = active?.nodes[token.id] as TokenResult | undefined;
                const chain = activeResult?.chain.slice(1).map((l) => l.label) ?? [];
                const selected = selection.includes(token.id);
                return (
                  <li key={token.id}>
                    <button
                      type="button"
                      onClick={() => focusNode(token.id)}
                      className={cn(
                        'grid w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-surface-3',
                        selected && 'bg-accent-soft hover:bg-accent-soft',
                      )}
                      style={gridCols}
                    >
                      <span className="min-w-0">
                        <span className="num block truncate text-[12px] text-fg">{token.name}</span>
                        <span className={cn('block truncate text-[11px]', chain.length ? 'text-fg-3' : 'text-warning')}>
                          {chain.length ? `→ ${chain.join(' → ')}` : 'Not connected'}
                        </span>
                      </span>
                      {themes.map((t) => (
                        <TokenValue
                          key={t.id}
                          result={all[t.id]?.nodes[token.id] as TokenResult | undefined}
                          primaryName={primary?.name ?? 'primary'}
                          compact={compact}
                        />
                      ))}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Section>

      <Section
        title={
          <button
            type="button"
            className="flex items-center gap-1 uppercase tracking-wide hover:text-fg"
            onClick={() => setShowPrimitives((v) => !v)}
            aria-expanded={showPrimitives}
          >
            <ChevronRight size={12} className={cn('transition-transform', showPrimitives && 'rotate-90')} />
            Primitives
          </button>
        }
        actions={<span className="num text-[11px] text-fg-3">{primitives.length}</span>}
      >
        {showPrimitives && (
          primitives.length === 0 ? (
            <p className="text-xs text-fg-3">Colors, palettes and mixes you add to the canvas show up here.</p>
          ) : (
            <ul className="-mx-1 flex flex-col">
              {primitives.map((node) => (
                <PrimitiveRow key={node.id} node={node} result={active} selected={selection.includes(node.id)} />
              ))}
            </ul>
          )
        )}
      </Section>
    </div>
  );
}

function PrimitiveRow({ node, result, selected }: { node: CanvasNode; result: ComputeResult | undefined; selected: boolean }) {
  const r = result?.nodes[node.id];
  const rowClass = cn(
    'flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-surface-3',
    selected && 'bg-accent-soft hover:bg-accent-soft',
  );

  if (r?.type === 'palette') {
    return (
      <li>
        <button type="button" className={cn(rowClass, 'flex-col items-stretch gap-1.5')} onClick={() => focusNode(node.id)}>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] text-fg">{node.name}</span>
            <span className="num shrink-0 text-[11px] text-fg-3">{r.shades.length} steps</span>
          </span>
          <span className="flex h-5 overflow-hidden rounded-md ring-1 ring-inset ring-line">
            {r.shades.map((s) => (
              <Tooltip key={s.index} content={`${s.name} · ${s.color.hex}`}>
                <span className="h-full flex-1" style={{ background: s.color.hex }} />
              </Tooltip>
            ))}
          </span>
        </button>
      </li>
    );
  }

  const color = outputColor(r);
  return (
    <li>
      <button type="button" className={rowClass} onClick={() => focusNode(node.id)}>
        <Swatch color={color?.hexa} className="h-5 w-5" />
        <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{node.name}</span>
        {node.type === 'mix' && <span className="text-[10px] uppercase tracking-wide text-fg-3">mix</span>}
        <span className="num shrink-0 text-[11px] text-fg-2">{color?.hexa ?? '—'}</span>
      </button>
    </li>
  );
}
