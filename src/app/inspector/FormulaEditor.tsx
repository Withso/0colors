// Formula editor for one channel: live result, step-by-step substitution, and a
// clickable reference of everything the formula language understands.
import { useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import type { ChannelTrace } from '@/engine/compute';
import { type ChannelDef, type Space, SPACES, formatChannel } from '@/engine/color/spaces';
import { FORMULA_FUNCTIONS, FORMULA_VARIABLES } from '@/engine/formula';
import { setChannelRule } from '../actions';
import { cn } from '../ui';
import { AutoTextarea, useDraft } from './common';

function examplesFor(def: ChannelDef, space: Space, hasParent: boolean): string[] {
  const k = def.key;
  const src = hasParent ? 'parent' : 'self';
  if (k === 'alpha') return hasParent ? ['parent.alpha * 0.5', 'dark ? 80 : 60', '100'] : ['dark ? 80 : 60', '100'];
  if (def.wrap) return [`${src}.${k} + 180`, `mod(${src}.${k} + 30, 360)`, `dark ? ${src}.${k} + 10 : ${src}.${k}`];
  if (space === 'rgb') return [`255 - ${src}.${k}`, `${src}.${k} * 0.8`, `lerp(${src}.${k}, 255, 0.5)`];
  const isLight = (space === 'hct' && k === 't') || (space !== 'hct' && k === 'l');
  if (isLight) {
    return hasParent
      ? [`parent.${k} - 10`, `parent.${k} > 60 ? 15 : 98`, 'contrast(parent, white) >= 4.5 ? 98 : 12']
      : ['dark ? 80 : 30', `self.${k} + 10`];
  }
  // Chroma / saturation
  const cap = space === 'oklch' ? '0.08' : space === 'hct' ? '40' : '30';
  return hasParent
    ? [`parent.${k} * 0.5`, `min(parent.${k}, ${cap})`, `dark ? parent.${k} * 0.8 : parent.${k}`]
    : [`dark ? self.${k} * 0.8 : self.${k}`, `min(self.${k}, ${cap})`];
}

export function FormulaEditor({
  nodeId, def, space, trace, hasParent, expr,
}: {
  nodeId: string; def: ChannelDef; space: Space; trace: ChannelTrace | undefined; hasParent: boolean; expr: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showRef, setShowRef] = useState(false);
  const commit = (v: string) => setChannelRule(nodeId, def.key, { mode: 'formula', expr: v });
  const { draft, change, flush } = useDraft(expr, commit);

  const insert = (text: string, caretBack = 0) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    change(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + text.length - caretBack;
      el.setSelectionRange(pos, pos);
    });
  };

  const error = trace?.error;
  const committed = trace?.expr ?? expr;
  const channelKeys = SPACES[space].channels.map((c) => c.key);
  const unit = def.unit ?? '';

  return (
    <div className="mt-2.5 space-y-2">
      <AutoTextarea
        textareaRef={textareaRef}
        ariaLabel={`${def.label} formula`}
        mono
        minRows={1}
        value={draft}
        onChange={change}
        onBlur={flush}
        placeholder={hasParent ? `parent.${def.key} + 10` : 'dark ? 80 : 30'}
        className={cn(error && 'border-danger hover:border-danger focus:border-danger')}
      />

      {error ? (
        <div className="rounded-[8px] bg-surface-2 px-2.5 py-2 text-[11.5px] leading-snug text-fg-2">
          <div className="flex items-start gap-2">
            <TriangleAlert size={13} className="mt-px shrink-0 text-danger" />
            <span>{error.message}</span>
          </div>
          {error.end > error.start && (
            <div className="num mt-1.5 break-all pl-[21px] text-[11px] text-fg-3">
              {committed.slice(0, error.start)}
              <span className="text-danger underline decoration-danger/70 decoration-wavy underline-offset-[3px]">
                {committed.slice(error.start, error.end)}
              </span>
              {committed.slice(error.end)}
            </div>
          )}
          <div className="mt-1.5 pl-[21px] text-[11px] text-fg-3">
            Using {hasParent ? 'the parent value' : 'the stored value'} until the formula works.
          </div>
        </div>
      ) : (
        trace?.explain && (
          <div className="border-l-2 border-line-strong pl-2.5">
            <div className="num flex items-baseline gap-2">
              <span className="text-[11px] text-fg-3">=</span>
              <span className="text-[14px] font-semibold text-fg">{formatChannel(def, trace.value)}{unit}</span>
              {trace.adjusted && (
                <span className="text-[11px] text-warning">
                  {trace.adjusted === 'wrap' ? 'wrapped' : 'clamped'} from {formatChannel(def, trace.raw)}
                </span>
              )}
            </div>
            {trace.explain.substituted !== committed.trim() && (
              <div className="num mt-0.5 break-all text-[11px] text-fg-3">{trace.explain.substituted}</div>
            )}
            {trace.explain.lookups.length > 0 && (
              <ul className="num mt-1.5 space-y-0.5 text-[11px]">
                {trace.explain.lookups.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="truncate text-fg-3">{l.text}</span>
                    <span className="text-fg-2">{l.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      )}

      <div className="flex flex-wrap gap-1">
        {examplesFor(def, space, hasParent).map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => { change(ex); commit(ex); }}
            className="num rounded-[6px] bg-surface-2 px-1.5 py-[3px] text-[10.5px] text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg"
            title="Use this example"
          >
            {ex}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowRef((v) => !v)}
        className="flex h-6 items-center gap-1 text-[11px] font-medium text-fg-3 transition-colors hover:text-fg"
        aria-expanded={showRef}
      >
        {showRef ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <BookOpen size={12} />
        Functions and variables
      </button>

      {showRef && (
        <div className="max-h-72 space-y-3 overflow-auto rounded-[8px] bg-surface-2 p-2.5">
          <p className="px-1.5 text-[11px] leading-relaxed text-fg-3">
            In this {SPACES[space].label} node, <span className="num text-fg-2">.{channelKeys.join(' .')}</span> read
            channels in the same space. Other spaces: <span className="num text-fg-2">parent.hsl.l</span>,{' '}
            <span className="num text-fg-2">parent.hct.t</span>, <span className="num text-fg-2">parent.rgb.r</span>,{' '}
            <span className="num text-fg-2">.alpha</span>. Click to insert.
          </p>
          <div>
            <div className="mb-1 px-1.5 text-[11px] font-medium text-fg-2">Variables</div>
            {FORMULA_VARIABLES.map((v) => (
              <RefItem
                key={v.name}
                title={v.name}
                description={v.description}
                onClick={() => insert(v.name === '@name' ? '@' : v.name === 'white / black' ? 'white' : v.name.startsWith('#') ? '#' : v.name)}
              />
            ))}
          </div>
          <div>
            <div className="mb-1 px-1.5 text-[11px] font-medium text-fg-2">Functions</div>
            {FORMULA_FUNCTIONS.map((f) => (
              <RefItem key={f.name} title={f.signature} description={f.description} onClick={() => insert(`${f.name === 'deltae' ? 'deltaE' : f.name}()`, 1)} />
            ))}
          </div>
          <div>
            <div className="mb-1 px-1.5 text-[11px] font-medium text-fg-2">Operators</div>
            <p className="num px-1.5 text-[11px] leading-relaxed text-fg-2">
              + − * / %  ·  &lt; &lt;= &gt; &gt;= == !=  ·  &amp;&amp; || !  (and or not)  ·  cond ? a : b
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function RefItem({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full rounded-[6px] px-1.5 py-1 text-left transition-colors hover:bg-surface-3">
      <span className="num block text-[11px] text-accent">{title}</span>
      <span className="block text-[11px] leading-snug text-fg-3">{description}</span>
    </button>
  );
}
