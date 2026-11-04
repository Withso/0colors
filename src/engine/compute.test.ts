import { describe, expect, it } from 'vitest';
import { type CanvasNode, type ChannelValues, type ColorNode, type Edge, type Project, type Space, type Theme, tokenHandle } from './model';
import { createColorNode, createContrastNode, createMixNode, createPaletteNode, createSectionNode, createTokenNode, makeEdge } from './defaults';
import { describe as describeColor } from './color/spaces';
import { mixRgb } from './color/mix';
import {
  type ColorResult, type ContrastResult, type MixResult, type PaletteResult, type TokenResult,
  computeAllThemes, computeProject, outputColor, outputNative, wouldCreateCycle,
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
  it('takes the edited channel from a final color formula', () => {
    const p = project([
      color('a', 'Parent', 'oklch', oklch(60, 0.1, 200)),
      color('b', 'Child', 'oklch', oklch(20, 0, 0), {
        l: { mode: 'formula', expr: 'mix(parent, white, 0.5)' },
        alpha: { mode: 'formula', expr: '#ff000080' },
      }),
    ], [edge('a', 'b')]);
    const result = computeProject(p, 'light');
    const mixed = mixRgb(asColor(result, 'a').color.rgb, { r: 1, g: 1, b: 1 }, 0.5, 'oklab');
    const expected = describeColor(mixed.rgb);
    const l = channel(asColor(result, 'b'), 'l');
    expect(l.error).toBeUndefined();
    expect(l.value).toBeCloseTo(expected.oklch.l * 100, 10);
    expect(l.explain?.steps[0]).toMatchObject({ type: 'color', hex: expected.hexa });
    expect(channel(asColor(result, 'b'), 'alpha').value).toBeCloseTo(128 / 255 * 100, 10);
  });

  it.each(['{value}', 'round('])('preserves successful row explanations before %s fails', (failure) => {
    const expr = `row1 = white\nrow2 = 50\n${failure}`;
    const p = project([color('a', 'Color', 'oklch', oklch(40, 0.1, 200), { l: { mode: 'formula', expr } })]);
    const l = channel(asColor(computeProject(p, 'light'), 'a'), 'l');
    expect(l.error).toBeDefined();
    expect(l.value).toBe(40);
    expect(l.explain).toEqual({ lookups: [], substituted: '', steps: [
      { name: 'row1', text: 'row1 = white', value: '#FFFFFF', start: 0, end: 12, type: 'color', hex: '#FFFFFF' },
      { name: 'row2', text: 'row2 = 50', value: '50', start: 13, end: 22, type: 'number' },
    ] });
  });

  it('explains formula rows and collects references from named statements', () => {
    const p = project([
      color('a', 'Base', 'oklch', oklch(60, 0.1, 200)),
      color('b', 'Derived', 'oklch', oklch(0, 0, 0), {
        l: { mode: 'formula', expr: 'base = @base;\nout_1 = base.l - 10\nif dark then out_1 + 20 else out_1' },
      }),
    ]);
    for (const theme of p.themes) {
      const result = computeProject(p, theme.id);
      const l = channel(asColor(result, 'b'), 'l');
      expect(l.error).toBeUndefined();
      expect(l.value).toBe(theme.dark ? 70 : 50);
      expect(l.explain?.steps.map((s) => s.name)).toEqual(['base', 'out_1', null]);
      expect(result.refs).toEqual([{ id: 'ref:a->b', source: 'a', target: 'b' }]);
    }
  });

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
  it('reuses results for cloned documents and visual-only section edits', () => {
    const p = project([
      color('a', 'A', 'oklch', oklch(50, 0.1, 200)),
      createSectionNode({ id: 'frame', name: 'Frame', position: at }),
    ]);
    const first = computeProject(p, 'light');
    expect(computeProject(structuredClone(p), 'light', first)).toBe(first);
    const moved = structuredClone(p);
    moved.nodes[0].position = { x: 50, y: -50 };
    moved.nodes[1].name = 'Changed frame';
    expect(computeProject(moved, 'light', first)).toBe(first);
  });

  it('updates changed explanations even when a formula’s numeric result is unchanged', () => {
    const p = project([color('a', 'A', 'oklch', oklch(50, 0.1, 200), { l: { mode: 'formula', expr: 'out_1 = 20; out_1' } })]);
    const first = computeProject(p, 'light');
    const changed = project([color('a', 'A', 'oklch', oklch(50, 0.1, 200), { l: { mode: 'formula', expr: 'base = 20; base' } })]);
    const next = computeProject(changed, 'light', first);
    expect(next.nodes.a).not.toBe(first.nodes.a);
    expect(asColor(next, 'a').values).toEqual(asColor(first, 'a').values);
    expect(channel(asColor(next, 'a'), 'l').explain?.steps[0].name).toBe('base');
    expect(next.refs).toBe(first.refs);
  });

  it('updates errors, removals and reference dependencies', () => {
    const p = project([
      color('base', 'Base', 'oklch', oklch(50, 0.1, 200)),
      color('child', 'Child', 'oklch', oklch(50, 0.1, 200), { l: { mode: 'formula', expr: '@base.l' } }),
    ]);
    const first = computeProject(p);
    const missing = computeProject({ ...p, nodes: p.nodes.slice(1) }, undefined, first);
    expect(Object.keys(missing.nodes)).toEqual(['child']);
    expect(missing.refs).toEqual([]);
    expect(channel(asColor(missing, 'child'), 'l').error?.message).toContain('@base');
  });

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

describe('imported ids and output handles', () => {
  it('computes arbitrary node ids and theme ids as data', () => {
    const p = project([
      color('__proto__', 'Base', 'oklch', oklch(50, 0.1, 200)),
      color('constructor', 'Child', 'oklch', oklch(0, 0, 0)),
    ], [edge('__proto__', 'constructor')], [
      { id: '__proto__', name: 'Light', dark: false }, { id: 'constructor', name: 'Dark', dark: true },
    ]);
    const all = computeAllThemes(p);
    expect(Object.keys(all)).toEqual(['__proto__', 'constructor']);
    for (const result of Object.values(all)) {
      expect(Object.keys(result.nodes)).toEqual(['__proto__', 'constructor']);
      expect(asColor(result, 'constructor').values.l).toBe(50);
      expect(asColor(result, '__proto__').values.h).toBe(200);
      expect(computeProject(p, result.themeId, result)).toBe(result);
    }
  });

  it('rejects invalid handles rather than accidentally reading palette shade zero', () => {
    const pal = createPaletteNode({ id: 'pal', name: 'Scale', position: at, steps: 3 });
    const root = color('a', 'A', 'oklch', oklch(50, 0.1, 200));
    const result = computeProject(project([pal, root]));
    for (const handle of ['', 's', 'x0', 's-1', 's1.5', 'snope', 's9']) {
      expect(outputColor(result.nodes.pal, handle), handle).toBeNull();
      expect(outputNative(result.nodes.pal, handle), handle).toBeUndefined();
    }
    expect(outputColor(result.nodes.pal, 's0')).not.toBeNull();
    expect(outputNative(result.nodes.pal, 's0')).toBeDefined();
    expect(outputColor(result.nodes.a, 'in')).toBeNull();
    expect(outputNative(result.nodes.a, 'in')).toBeUndefined();
  });

  it('does not let a section shadow a color’s formula reference', () => {
    const p = project([
      createSectionNode({ id: 'frame', name: 'Brand', position: at }),
      color('brand', 'Brand', 'oklch', oklch(50, 0.1, 200)),
      color('a', 'A', 'oklch', oklch(0, 0, 0), { l: { mode: 'formula', expr: '@brand.l' } }),
    ]);
    const r = computeProject(p);
    expect(asColor(r, 'a').values.l).toBe(50);
    expect(r.refs).toEqual([{ id: 'ref:brand->a', source: 'brand', target: 'a' }]);
  });

  it('keeps error spans on an actual reference after comments and earlier rows', () => {
    const expr = '// @missing is an example\nout_1 = 5\nout_1 + @missing.l';
    const p = project([color('a', 'A', 'oklch', oklch(40, 0.1, 200), { l: { mode: 'formula', expr } })]);
    const error = channel(asColor(computeProject(p), 'a'), 'l').error!;
    expect(error.start).toBe(expr.lastIndexOf('@missing'));
    expect(expr.slice(error.start, error.end)).toBe('@missing');
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
