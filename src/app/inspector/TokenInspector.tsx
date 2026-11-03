// Inspector for a Token node: one source per theme, fallbacks and alias chains.
import { useMemo } from 'react';
import { ArrowRight, ChevronDown, CornerDownRight } from 'lucide-react';
import { type TokenNode, slugify, tokenHandle } from '@/engine/model';
import { type TokenResult, computeAllThemes } from '@/engine/compute';
import { canConnect, connect, disconnectInput, updateNodeData } from '../actions';
import { useEditor } from '../store';
import { Badge, CopyButton, Section, Swatch, cn } from '../ui';
import { AutoTextarea, FIELD_CLASS, InspectorHeader, focusNode, useDraft } from './common';

interface Candidate { value: string; source: string; handle: string; label: string; group: string }

const GROUPS = ['Palettes', 'Colors', 'Mixes', 'Tokens'] as const;

export function TokenInspector({ node }: { node: TokenNode }) {
  const project = useEditor((s) => s.project);
  const active = useEditor((s) => s.result);
  const all = useMemo(() => computeAllThemes(project), [project]);
  const primary = project.themes[0];
  const cssName = `--${node.name.split(/[/.]/).map((s) => slugify(s)).filter(Boolean).join('-')}`;

  const candidates = useMemo(() => {
    const out: Candidate[] = [];
    for (const n of project.nodes) {
      if (n.id === node.id) continue;
      if (n.type === 'palette') {
        const r = active.nodes[n.id];
        if (r?.type !== 'palette') continue;
        for (const s of r.shades) out.push({ value: `${n.id}|s${s.index}`, source: n.id, handle: `s${s.index}`, label: `${n.name} ${s.name}`, group: 'Palettes' });
      } else if (n.type === 'color') out.push({ value: `${n.id}|out`, source: n.id, handle: 'out', label: n.name, group: 'Colors' });
      else if (n.type === 'mix') out.push({ value: `${n.id}|out`, source: n.id, handle: 'out', label: n.name, group: 'Mixes' });
      else if (n.type === 'token') out.push({ value: `${n.id}|out`, source: n.id, handle: 'out', label: n.name, group: 'Tokens' });
    }
    return out;
  }, [project.nodes, active, node.id]);

  const usedBy = project.edges
    .filter((e) => e.source === node.id)
    .map((e) => project.nodes.find((n) => n.id === e.target))
    .filter((n): n is NonNullable<typeof n> => !!n);

  const description = useDraft(node.data.description, (v) => updateNodeData<TokenNode>(node.id, (d) => { d.description = v; }, `token:${node.id}:description`));

  return (
    <div>
      <InspectorHeader
        node={node}
        hint={
          <span className="flex items-center gap-0.5">
            <span className="num text-fg-2">{cssName}</span>
            <CopyButton text={`var(${cssName})`} label="Copy CSS variable" className="h-5 w-5" />
          </span>
        }
      />

      <Section title="Description">
        <AutoTextarea
          ariaLabel="Token description"
          value={description.draft}
          onChange={description.change}
          onBlur={description.flush}
          placeholder="What is this token for? e.g. Default page background"
        />
      </Section>

      <Section title="Value per theme">
        <div className="-my-1 divide-y divide-line">
          {project.themes.map((theme, i) => {
            const r = all[theme.id]?.nodes[node.id] as TokenResult | undefined;
            const handle = tokenHandle(theme.id);
            const edge = project.edges.find((e) => e.target === node.id && e.targetHandle === handle);
            const current = edge ? `${edge.source}|${edge.sourceHandle}` : '';
            const options = candidates.filter((c) => c.value === current || canConnect({ source: c.source, sourceHandle: c.handle, target: node.id, targetHandle: handle }));
            return (
              <div key={theme.id} className="py-3">
                <div className="mb-2 flex items-center gap-2.5">
                  <Swatch color={r?.color?.hexa} className="h-8 w-8 rounded-[8px]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-medium text-fg">{theme.name}</span>
                      {i === 0 && <Badge tone="accent">Primary</Badge>}
                      {theme.dark && !/dark/i.test(theme.name) && <Badge>Dark</Badge>}
                      <span className="num ml-auto text-[11.5px] text-fg-2">{r?.color ? r.color.hexa : ''}</span>
                    </div>
                    <div className="truncate text-[11px] text-fg-3">
                      {r?.inherited
                        ? `Falls back to ${primary.name}${r.source ? ` · ${r.source.label}` : ''}`
                        : r?.source
                          ? `From ${r.source.label}`
                          : i === 0 ? 'Connect a color, palette step or token' : `Not set — and ${primary.name} is empty too`}
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <select
                    aria-label={`Source for ${theme.name}`}
                    value={current}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) { disconnectInput(node.id, handle); return; }
                      const c = candidates.find((x) => x.value === v);
                      if (c) connect({ source: c.source, sourceHandle: c.handle, target: node.id, targetHandle: handle });
                    }}
                    className={cn('h-7 w-full min-w-0 appearance-none truncate pl-2 pr-7 text-[12.5px]', FIELD_CLASS)}
                  >
                    <option value="">{i === 0 ? '— none —' : `— same as ${primary.name} —`}</option>
                    {GROUPS.map((g) => {
                      const items = options.filter((o) => o.group === g);
                      if (!items.length) return null;
                      return (
                        <optgroup key={g} label={g}>
                          {items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                  <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fg-3" />
                </div>
                {r && r.chain.length > 1 && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-fg-3">
                    {r.chain.map((link, idx) => (
                      <span key={`${link.nodeId}-${idx}`} className="flex items-center gap-1">
                        {idx > 0 && <ArrowRight size={10} className="text-fg-3" />}
                        <button
                          type="button"
                          onClick={() => focusNode(link.nodeId)}
                          className={cn('rounded-[4px] px-1 py-px transition-colors hover:bg-surface-2 hover:text-fg', link.type === 'token' ? 'num text-fg-2' : 'text-fg-2')}
                        >
                          {link.label}
                        </button>
                      </span>
                    ))}
                    {r.color && <span className="num flex items-center gap-1"><ArrowRight size={10} />{r.color.hex}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {usedBy.length > 0 && (
        <Section title="Used by">
          <ul className="-mx-1.5">
            {usedBy.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => focusNode(n.id)} className="flex h-7 w-full items-center gap-1.5 rounded-[6px] px-1.5 text-left text-[12px] text-fg transition-colors hover:bg-surface-2">
                  <CornerDownRight size={12} className="text-fg-3" />
                  <span className={cn('truncate', n.type === 'token' && 'num')}>{n.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
