import { describe, expect, it } from 'vitest';
import { type CanvasNode, type ChannelValues, type ColorNode, type Edge, type Project, type Space, type Theme, tokenHandle } from './model';
import { createColorNode, createContrastNode, createMixNode, createPaletteNode, createTokenNode, makeEdge } from './defaults';
import {
  type ColorResult, type ContrastResult, type MixResult, type PaletteResult, type TokenResult,
  computeProject, wouldCreateCycle,
} from './compute';

const LIGHT: Theme = { id: 'light', name: 'Light', dark: false };
const DARK: Theme = { id: 'dark', name: 'Dark', dark: true };
const at = { x: 0, y: 0 };

function project(nodes: CanvasNode[], edges: Edge[] = [], themes: Theme[] = [LIGHT, DARK]): Project {
  return { schema: 2, id: 'p', name: 'Test', createdAt: 0, updatedAt: 0, themes, nodes, edges, preview: { bindings: {} } };
}

function color(id: string, name: string, space: Space, values: ChannelValues, rules: ColorNode['data']['rules'] = {}): ColorNode {
  return createColorNode({ id, name, position: at, space, values: { alpha: 100, ...values }, rules });
}

const oklch = (l: number, c: number, h: number) => ({ l, c, h });
const edge = (source: string, target: string, targetHandle = 'in', sourceHandle = 'out') => makeEdge(source, sourceHandle, target, targetHandle);
const asColor = (r: ReturnType<typeof computeProject>, id: string) => r.nodes[id] as ColorResult;
const channel = (r: ColorResult, key: string) => r.channels.find((c) => c.key === key)!;

describe('computeProject — color rules', () => {
  it('inherits every channel from the parent by default', () => {
    const p = project([color('a', 'Parent', 'oklch', oklch(60, 0.1, 200)), color('b', 'Child', 'oklch', oklch(10, 0, 0))], [edge('a', 'b')]);
    const r = computeProject(p, 'light');
    const child = asColor(r, 'b');
    expect(child.values.l).toBeCloseTo(60);
    expect(child.values.c).toBeCloseTo(0.1);
    expect(child.values.h).toBeCloseTo(200);
    expect(channel(child, 'l').mode).toBe('inherit');
    expect(channel(child, 'l').parent).toBeCloseTo(60);
    expect(child.parentId).toBe('a');
    expect(child.parentLabel).toBe('Parent');
    expect(child.color.hex).toBe(asColor(r, 'a').color.hex);
  });

  it('offsets wrap hue and clamp lightness', () => {
    const p = project(
      [
        color('a', 'Parent', 'oklch', oklch(60, 0.1, 350)),
        color('b', 'Child', 'oklch', oklch(0, 0, 0), { h: { mode: 'offset', delta: 20 }, l: { mode: 'offset', delta: 50 } }),
      ],
      [edge('a', 'b')],
    );
    const child = asColor(computeProject(p, 'light'), 'b');
    const h = channel(child, 'h');
    expect(h.value).toBeCloseTo(10);
    expect(h.raw).toBeCloseTo(370);
    expect(h.adjusted).toBe('wrap');
    expect(h.delta).toBe(20);
    expect(h.parent).toBeCloseTo(350);
    const l = channel(child, 'l');
    expect(l.value).toBe(100);
    expect(l.raw).toBeCloseTo(110);
    expect(l.adjusted).toBe('clamp');
  });

  it('fixed channels use the node’s own value', () => {
    const p = project(
      [color('a', 'Parent', 'oklch', oklch(60, 0.1, 200)), color('b', 'Child', 'oklch', oklch(30, 0.05, 90), { c: { mode: 'fixed' } })],
      [edge('a', 'b')],
    );
    const child = asColor(computeProject(p, 'light'), 'b');
    expect(channel(child, 'c').mode).toBe('fixed');
    expect(child.values.c).toBeCloseTo(0.05);
    expect(child.values.l).toBeCloseTo(60);
  });

  it('evaluates formulas and explains them', () => {
    const p = project(
      [
        color('a', 'Parent', 'oklch', oklch(60, 0.1, 200)),
        color('b', 'Child', 'oklch', oklch(0, 0, 0), { l: { mode: 'formula', expr: 'parent.l > 50 ? 20 : 90' } }),
      ],
      [edge('a', 'b')],
    );
    const l = channel(asColor(computeProject(p, 'light'), 'b'), 'l');
    expect(l.mode).toBe('formula');
    expect(l.value).toBe(20);
    expect(l.expr).toBe('parent.l > 50 ? 20 : 90');
    expect(l.explain?.substituted).toBe('60 > 50 ? 20 : 90');
    expect(l.explain?.lookups).toEqual([{ text: 'parent.l', value: '60' }]);
    expect(l.error).toBeUndefined();
  });

  it('roots ignore inherit/offset and use their own values', () => {
    const p = project([color('a', 'Root', 'oklch', oklch(40, 0.1, 120), { l: { mode: 'offset', delta: 10 }, h: { mode: 'inherit' } })]);
    const root = asColor(computeProject(p, 'light'), 'a');
    expect(root.values.l).toBeCloseTo(40);
    expect(root.values.h).toBeCloseTo(120);
    expect(root.channels.every((c) => c.mode === 'root')).toBe(true);
    expect(root.parentId).toBeNull();
  });

  it('a formula on a root without parent reports an error and keeps its own value', () => {
    const p = project([color('a', 'Root', 'oklch', oklch(40, 0.1, 120), { l: { mode: 'formula', expr: 'parent.l + 5' } })]);
    const l = channel(asColor(computeProject(p, 'light'), 'a'), 'l');
    expect(l.error?.message).toMatch(/no parent/);
    expect(l.value).toBeCloseTo(40);
  });

  it('converts a parent from a different space', () => {
    const p = project([color('a', 'Parent', 'hsl', { h: 210, s: 80, l: 50 }), color('b', 'Child', 'oklch', oklch(0, 0, 0))], [edge('a', 'b')]);
    const r = computeProject(p, 'light');
    const parent = asColor(r, 'a').color.rgb255;
    const child = asColor(r, 'b').color.rgb255;
    expect(Math.abs(parent.r - child.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(parent.g - child.g)).toBeLessThanOrEqual(1);
    expect(Math.abs(parent.b - child.b)).toBeLessThanOrEqual(1);
  });

  it('passes native values to a same-space child so grays keep their hue', () => {
    const p = project([color('a', 'Gray', 'oklch', oklch(50, 0, 123)), color('b', 'Child', 'oklch', oklch(0, 0, 0))], [edge('a', 'b')]);
    expect(asColor(computeProject(p, 'light'), 'b').values.h).toBeCloseTo(123);
  });

  it('resolves @references by slug, case-insensitively', () => {
    const p = project([
      color('base', 'Base', 'oklch', oklch(40, 0.1, 200)),
      color('x', 'Uses base', 'oklch', oklch(0, 0, 0), { l: { mode: 'formula', expr: '@base.l + 10' }, c: { mode: 'formula', expr: '@BASE.c * 2' } }),
    ]);
    const r = computeProject(p, 'light');
    const x = asColor(r, 'x');
    expect(x.values.l).toBeCloseTo(50);
    expect(x.values.c).toBeCloseTo(0.2);
    expect(r.refs).toEqual([{ id: 'ref:base->x', source: 'base', target: 'x' }]);
  });

  it('reads `dark` from the active theme', () => {
    const p = project([color('a', 'Adaptive', 'oklch', oklch(50, 0.1, 200), { l: { mode: 'formula', expr: 'dark ? 80 : 20' } })]);
    expect(asColor(computeProject(p, 'light'), 'a').values.l).toBe(20);
    expect(asColor(computeProject(p, 'dark'), 'a').values.l).toBe(80);
  });

  it('falls back to the primary theme for an unknown theme id', () => {
    const p = project([color('a', 'A', 'oklch', oklch(50, 0.1, 200))]);
    expect(computeProject(p, 'nope').themeId).toBe('light');
  });

  it('reports circular formula references instead of throwing', () => {
    const p = project([
      color('a', 'Alpha', 'oklch', oklch(40, 0.1, 200), { l: { mode: 'formula', expr: '@beta.l' } }),
      color('b', 'Beta', 'oklch', oklch(60, 0.1, 200), { l: { mode: 'formula', expr: '@alpha.l' } }),
    ]);
    const r = computeProject(p, 'light');
    const errors = [asColor(r, 'a'), asColor(r, 'b')].flatMap((n) => n.channels).map((c) => c.error?.message).filter(Boolean);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).toMatch(/Circular/);
  });

  it('gives unknown @references an error span', () => {
    const expr = 'clamp(@nope.l, 0, 100)';
    const p = project([color('a', 'A', 'oklch', oklch(40, 0.1, 200), { l: { mode: 'formula', expr } })]);
    const err = channel(asColor(computeProject(p, 'light'), 'a'), 'l').error!;
    expect(err.message).toMatch(/@nope/);
    expect(err.start).toBe(expr.indexOf('@nope'));
    expect(err.end).toBe(expr.indexOf('@nope') + '@nope'.length);
  });

  it('survives an edge loop and warns', () => {
    const p = project([color('a', 'A', 'oklch', oklch(40, 0.1, 200)), color('b', 'B', 'oklch', oklch(60, 0.1, 100))], [edge('a', 'b'), edge('b', 'a')]);
    const r = computeProject(p, 'light');
    const warned = [asColor(r, 'a'), asColor(r, 'b')].some((n) => n.warnings.length > 0);
    expect(warned).toBe(true);
  });
});

describe('computeProject — palette, mix, contrast', () => {
  it('generates a palette from its own hue and chroma', () => {
    const pal = createPaletteNode({ id: 'pal', name: 'Pal', position: at, hue: 200, chroma: 0.1, chromaMode: 'constant', steps: 5, hueShift: 0 });
    const r = computeProject(project([pal]), 'light').nodes.pal as PaletteResult;
    expect(r.shades).toHaveLength(5);
    expect(r.baseFromInput).toBe(false);
    for (const s of r.shades) {
      expect(s.values.h).toBeCloseTo(200);
      expect(s.values.c).toBeCloseTo(0.1);
    }
    expect(r.base.hex).toBe(r.shades[2].color.hex);
  });

  it('takes hue and chroma from a connected input', () => {
    const pal = createPaletteNode({ id: 'pal', name: 'Pal', position: at, chromaMode: 'constant', steps: 5, hueShift: 0 });
    const src = color('src', 'Source', 'oklch', oklch(60, 0.12, 30));
    const res = computeProject(project([src, pal], [edge('src', 'pal')]), 'light');
    const r = res.nodes.pal as PaletteResult;
    expect(r.baseFromInput).toBe(true);
    expect(r.base.hex).toBe(asColor(res, 'src').color.hex);
    for (const s of r.shades) {
      expect(s.values.h).toBeCloseTo(30, 1);
      expect(s.values.c).toBeCloseTo(0.12, 2);
    }
  });

  it('mixes fallback colors and connected inputs', () => {
    const mix = createMixNode({ id: 'm', name: 'Mix', position: at, space: 'srgb', ratio: 0.5, a: '#000000', b: '#FFFFFF' });
    const alone = computeProject(project([mix]), 'light').nodes.m as MixResult;
    expect(alone.color.hex).toBe('#808080');
    expect(alone.aConnected).toBe(false);

    const red = createColorNode({ id: 'red', name: 'Red', position: at, space: 'rgb', hex: '#FF0000' });
    const wired = computeProject(project([red, mix], [edge('red', 'm', 'a')]), 'light').nodes.m as MixResult;
    expect(wired.a.hex).toBe('#FF0000');
    expect(wired.aConnected).toBe(true);
    expect(wired.bConnected).toBe(false);
  });

  it('measures contrast, compositing translucent text', () => {
    const solid = createContrastNode({ id: 'c', name: 'C', position: at, fg: '#000000', bg: '#FFFFFF' });
    const r = computeProject(project([solid]), 'light').nodes.c as ContrastResult;
    expect(r.wcag).toBeCloseTo(21, 1);
    expect(r.apca).toBeGreaterThan(100);

    const faded = createContrastNode({ id: 'c', name: 'C', position: at, fg: '#00000080', bg: '#FFFFFF' });
    const f = computeProject(project([faded]), 'light').nodes.c as ContrastResult;
    expect(f.wcag).toBeLessThan(21);
    expect(f.seen.hex).not.toBe('#000000');
  });
});

describe('computeProject — tokens', () => {
  const red = () => createColorNode({ id: 'red', name: 'Red', position: at, space: 'rgb', hex: '#FF0000' });
  const blue = () => createColorNode({ id: 'blue', name: 'Blue', position: at, space: 'rgb', hex: '#0000FF' });
  const token = (id: string, name: string) => createTokenNode({ id, name, position: at });

  it('uses each theme’s own input', () => {
    const p = project([red(), blue(), token('t', 'accent')], [edge('red', 't', tokenHandle('light')), edge('blue', 't', tokenHandle('dark'))]);
    const light = computeProject(p, 'light').nodes.t as TokenResult;
    const dark = computeProject(p, 'dark').nodes.t as TokenResult;
    expect(light.color?.hex).toBe('#FF0000');
    expect(light.source?.nodeId).toBe('red');
    expect(dark.color?.hex).toBe('#0000FF');
    expect(dark.inherited).toBe(false);
  });

  it('falls back to the primary theme’s input', () => {
    const p = project([red(), token('t', 'accent')], [edge('red', 't', tokenHandle('light'))]);
    const dark = computeProject(p, 'dark').nodes.t as TokenResult;
    expect(dark.color?.hex).toBe('#FF0000');
    expect(dark.inherited).toBe(true);
  });

  it('leaves unassigned tokens empty', () => {
    const r = computeProject(project([token('t', 'accent')]), 'light').nodes.t as TokenResult;
    expect(r.color).toBeNull();
    expect(r.source).toBeNull();
    expect(r.chain).toEqual([{ nodeId: 't', label: 'accent', type: 'token' }]);
  });

  it('follows alias chains down to a palette shade', () => {
    const pal = createPaletteNode({ id: 'pal', name: 'Neutral', position: at, steps: 3, naming: 'hundreds' });
    const p = project(
      [pal, token('t1', 'bg/surface'), token('t2', 'card/bg')],
      [edge('pal', 't1', tokenHandle('light'), 's1'), edge('t1', 't2', tokenHandle('light'))],
    );
    const r = computeProject(p, 'light');
    const t2 = r.nodes.t2 as TokenResult;
    expect(t2.chain).toEqual([
      { nodeId: 't2', label: 'card/bg', type: 'token' },
      { nodeId: 't1', label: 'bg/surface', type: 'token' },
      { nodeId: 'pal', label: 'Neutral 200', type: 'palette' },
    ]);
    expect(t2.color?.hex).toBe((r.nodes.pal as PaletteResult).shades[1].color.hex);
  });
});

describe('computeProject — reconcile', () => {
  it('reuses identical results', () => {
    const p = project([color('a', 'A', 'oklch', oklch(50, 0.1, 200)), color('b', 'B', 'oklch', oklch(70, 0.05, 40))]);
    const first = computeProject(p, 'light');
    expect(computeProject(p, 'light', first)).toBe(first);

    const changed = { ...p, nodes: [color('a', 'A', 'oklch', oklch(55, 0.1, 200)), p.nodes[1]] };
    const next = computeProject(changed, 'light', first);
    expect(next).not.toBe(first);
    expect(next.nodes.b).toBe(first.nodes.b);
    expect(next.nodes.a).not.toBe(first.nodes.a);
  });

  it('does not reuse results across themes', () => {
    const p = project([color('a', 'A', 'oklch', oklch(50, 0.1, 200))]);
    const light = computeProject(p, 'light');
    const dark = computeProject(p, 'dark', light);
    expect(dark).not.toBe(light);
    expect(dark.themeId).toBe('dark');
  });
});

describe('wouldCreateCycle', () => {
  const edges = [edge('a', 'b'), edge('b', 'c')];
  it('detects loops', () => {
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true);
    expect(wouldCreateCycle(edges, 'a', 'a')).toBe(true);
  });
  it('allows forward and unrelated edges', () => {
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(false);
    expect(wouldCreateCycle(edges, 'x', 'y')).toBe(false);
  });
});
