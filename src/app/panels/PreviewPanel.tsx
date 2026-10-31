// ─────────────────────────────────────────────────────────────
// Live preview: a small app UI painted only with tokens, once per theme, so
// Light and Dark (and any other theme) can be compared side by side.
// ─────────────────────────────────────────────────────────────
import { type CSSProperties, type ReactNode, useDeferredValue, useMemo } from 'react';
import { toast } from 'sonner';
import { Wand2 } from 'lucide-react';
import { PREVIEW_SLOTS, type PreviewSlot, type Project, type Theme, type TokenNode } from '@/engine/model';
import { autoBind } from './preview-bind';
import { type ComputeResult, type TokenResult, computeAllThemes } from '@/engine/compute';
import { setPreviewBinding } from '../actions';
import { getEditor, useEditor } from '../store';
import { Button, FieldRow, Section, Select } from '../ui';

const SLOT_LABELS: Record<PreviewSlot, string> = {
  background: 'Background',
  surface: 'Surface',
  border: 'Border',
  text: 'Text',
  'text-muted': 'Muted text',
  primary: 'Primary',
  'on-primary': 'On primary',
  success: 'Success',
  warning: 'Warning',
  danger: 'Danger',
};

// Neutral stand-ins for slots that have no token yet (preview content, not app chrome).
const FALLBACK: Record<'light' | 'dark', Record<PreviewSlot, string>> = {
  light: {
    background: '#F4F5F7', surface: '#FFFFFF', border: '#DFE2E8', text: '#16181D', 'text-muted': '#626A77',
    primary: '#4B63E6', 'on-primary': '#FFFFFF', success: '#1E9853', warning: '#B87508', danger: '#D3343C',
  },
  dark: {
    background: '#0E0F12', surface: '#17191D', border: '#2B2E35', text: '#F1F2F4', 'text-muted': '#9AA1AD',
    primary: '#7C91FF', 'on-primary': '#0E0F12', success: '#3ED38A', warning: '#F2B53E', danger: '#FF6B6E',
  },
};

interface SlotValue { color: string; bound: boolean; tokenName?: string }

function resolveSlots(project: Project, result: ComputeResult | undefined, theme: Theme): Record<PreviewSlot, SlotValue> {
  const out = {} as Record<PreviewSlot, SlotValue>;
  for (const slot of PREVIEW_SLOTS) {
    const id = project.preview.bindings[slot];
    const node = id ? project.nodes.find((n) => n.id === id) : undefined;
    const r = id ? (result?.nodes[id] as TokenResult | undefined) : undefined;
    const color = r?.type === 'token' ? r.color?.hexa : undefined;
    out[slot] = color
      ? { color, bound: true, tokenName: node?.name }
      : { color: FALLBACK[theme.dark ? 'dark' : 'light'][slot], bound: false, tokenName: node?.name };
  }
  return out;
}

const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** Wraps a preview element: unbound slots get a dashed outline and an explanation on hover. */
function Slot({ slots, slot, children, className, style }: {
  slots: Record<PreviewSlot, SlotValue>; slot: PreviewSlot | PreviewSlot[]; children: ReactNode; className?: string; style?: CSSProperties;
}) {
  const list = Array.isArray(slot) ? slot : [slot];
  const unbound = list.filter((s) => !slots[s].bound);
  const title = list
    .map((s) => (slots[s].bound ? `${SLOT_LABELS[s]}: ${slots[s].tokenName}` : `${SLOT_LABELS[s]}: unbound — using a stand-in color`))
    .join('\n');
  return (
    <div
      title={title}
      className={className}
      style={{ ...style, ...(unbound.length ? { outline: `1px dashed ${tint(slots.text.color, 45)}`, outlineOffset: 2 } : null) }}
    >
      {children}
    </div>
  );
}

function MockApp({ slots }: { slots: Record<PreviewSlot, SlotValue> }) {
  const c = (s: PreviewSlot) => slots[s].color;
  return (
    <Slot slots={slots} slot="background" className="overflow-hidden rounded-[12px] text-[12px] leading-snug shadow-node" style={{ background: c('background'), boxShadow: `0 0 0 1px ${c('border')}, var(--app-node-shadow)` }}>
      {/* Window title bar (neutral dots, tinted from the theme's muted text). */}
      <div className="flex h-6 items-center gap-[5px] px-2.5" style={{ background: c('surface') }}>
        {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 rounded-full" style={{ background: tint(c('text-muted'), 35) }} />)}
      </div>
      <Slot slots={slots} slot={['surface', 'border']} className="flex items-center gap-2 px-3 pb-2.5 pt-1" style={{ background: c('surface'), borderBottom: `1px solid ${c('border')}` }}>
        <span className="h-5 w-5 shrink-0 rounded-md" style={{ background: c('primary') }} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold" style={{ color: c('text') }}>Northwind</div>
          <div className="truncate text-[11px]" style={{ color: c('text-muted') }}>Workspace overview</div>
        </div>
        <span className="h-6 w-6 shrink-0 rounded-full" style={{ background: tint(c('text-muted'), 30) }} />
      </Slot>

      <div className="flex flex-col gap-2.5 p-3">
        <Slot slots={slots} slot="surface" className="rounded-lg p-3" style={{ background: c('surface'), border: `1px solid ${c('border')}` }}>
          <Slot slots={slots} slot="text" className="text-[13px] font-semibold" style={{ color: c('text') }}>Upgrade to Pro</Slot>
          <Slot slots={slots} slot="text-muted" className="mt-0.5 text-[11px]" style={{ color: c('text-muted') }}>
            More seats, version history and priority support.
          </Slot>

          <div className="mt-2.5 flex items-center justify-between text-[10px]" style={{ color: c('text-muted') }}>
            <span>Storage</span>
            <span>64%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: tint(c('text-muted'), 22) }}>
            <Slot slots={slots} slot="primary" className="h-full rounded-full" style={{ width: '64%', background: c('primary') }}>{null}</Slot>
          </div>

          <div
            className="mt-2.5 flex h-7 items-center rounded-md px-2 text-[11px]"
            style={{ background: c('background'), border: `1px solid ${c('border')}`, color: c('text-muted') }}
          >
            you@example.com
          </div>

          <div className="mt-2.5 flex gap-2">
            <Slot
              slots={slots}
              slot={['primary', 'on-primary']}
              className="flex h-7 items-center rounded-md px-3 text-[11px] font-semibold"
              style={{ background: c('primary'), color: c('on-primary') }}
            >
              Upgrade
            </Slot>
            <div
              className="flex h-7 items-center rounded-md px-3 text-[11px] font-medium"
              style={{ background: c('surface'), color: c('text'), border: `1px solid ${c('border')}` }}
            >
              Not now
            </div>
          </div>
        </Slot>

        <div className="flex flex-wrap gap-1.5">
          {(['success', 'warning', 'danger'] as const).map((s) => (
            <Slot
              key={s}
              slots={slots}
              slot={s}
              className="flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-semibold"
              style={{ color: c(s), background: tint(c(s), 14), border: `1px solid ${tint(c(s), 30)}` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c(s) }} />
              {s === 'success' ? 'Synced' : s === 'warning' ? 'Pending review' : 'Payment failed'}
            </Slot>
          ))}
        </div>
      </div>
    </Slot>
  );
}

// ── Panel ────────────────────────────────────────────────────
export function PreviewPanel() {
  const liveProject = useEditor((s) => s.project);
  const project = useDeferredValue(liveProject);
  const activeThemeId = useEditor((s) => s.themeId);
  const all = useMemo(() => computeAllThemes(project), [project]);
  const tokens = project.nodes.filter((n): n is TokenNode => n.type === 'token');
  const bindings = liveProject.preview.bindings;
  const boundCount = PREVIEW_SLOTS.filter((s) => bindings[s]).length;

  const runAutoBind = () => {
    const found = autoBind(tokens);
    const count = Object.keys(found).length;
    if (!count) {
      toast.info('No token names matched', { description: 'Name tokens like bg/surface, text/primary or action/primary, or bind slots by hand below.' });
      return;
    }
    getEditor().update((d) => {
      for (const [slot, id] of Object.entries(found)) d.preview.bindings[slot as PreviewSlot] = id;
    });
    toast.success(`Bound ${count} of ${PREVIEW_SLOTS.length} slots by name`);
  };

  const options = [{ value: '', label: 'Not bound' }, ...tokens.map((t) => ({ value: t.id, label: t.name }))];

  return (
    <div>
      <Section title="Live preview" actions={<span className="num text-[11px] text-fg-3">{boundCount} of {PREVIEW_SLOTS.length} bound</span>}>
        <p className="mb-3.5 text-[11.5px] leading-relaxed text-fg-3">
          The same UI painted with your tokens in every theme. Change a primitive on the canvas and watch every theme update.
        </p>
        <div className="flex flex-col gap-5">
          {project.themes.map((theme) => (
            <figure key={theme.id} className="m-0">
              <figcaption className="mb-2 flex items-center gap-1.5 text-[11px] text-fg-3">
                <span className={theme.id === activeThemeId ? 'font-medium text-fg' : 'font-medium text-fg-2'}>{theme.name}</span>
                <span>· {theme.dark ? 'Dark' : 'Light'} appearance</span>
                {theme.id === activeThemeId && <span className="ml-auto flex items-center gap-1 text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Active</span>}
              </figcaption>
              <MockApp slots={resolveSlots(project, all[theme.id], theme)} />
            </figure>
          ))}
        </div>
      </Section>

      <Section
        title="Bindings"
        actions={
          <Button size="sm" variant="ghost" className="-mr-1.5" onClick={runAutoBind} disabled={!tokens.length}>
            <Wand2 size={13} /> Auto-bind
          </Button>
        }
      >
        {!tokens.length && (
          <p className="mb-2 text-[11.5px] text-fg-3">Add token nodes first — each preview slot reads one token.</p>
        )}
        {PREVIEW_SLOTS.map((slot) => (
          <FieldRow key={slot} label={SLOT_LABELS[slot]}>
            <Select
              label={`${SLOT_LABELS[slot]} token`}
              value={bindings[slot] ?? ''}
              options={options}
              onChange={(v) => setPreviewBinding(slot, v || null)}
            />
          </FieldRow>
        ))}
      </Section>
    </div>
  );
}
