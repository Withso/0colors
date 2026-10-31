import { describe, expect, it } from 'vitest';
import { createSampleProject, estimateNoteHeight } from './sample';
import { computeProject, type ColorResult, type ContrastResult, type TokenResult } from '@/engine/compute';
import { type CanvasNode, slugify } from '@/engine/model';
import { wcagContrast } from '@/engine/color/contrast';

const byName = (nodes: CanvasNode[], name: string) => {
  const n = nodes.find((node) => node.name === name);
  if (!n) throw new Error(`missing node ${name}`);
  return n;
};

// Rough footprint of each node type, matching the layout constants in sample.ts.
function footprint(n: CanvasNode, themes: number): { w: number; h: number } {
  switch (n.type) {
    case 'color': return { w: 216, h: 170 };
    case 'palette': return { w: 236, h: 64 + n.data.steps * 24 };
    case 'mix': return { w: 236, h: 200 };
    case 'contrast': return { w: 256, h: 210 };
    case 'token': return { w: 236, h: 52 + themes * 34 };
    case 'note': return { w: n.data.width, h: estimateNoteHeight(n.data.text, n.data.width) };
  }
}

describe('createSampleProject', () => {
  const project = createSampleProject();
  const [light, dark] = project.themes;

  it('is a well-formed project with two themes', () => {
    expect(project.schema).toBe(2);
    expect(project.name).toBe('0colors sample');
    expect(project.themes.map((t) => [t.name, t.dark])).toEqual([['Light', false], ['Dark', true]]);
  });

  it('includes every node type', () => {
    const types = new Set(project.nodes.map((n) => n.type));
    expect([...types].sort()).toEqual(['color', 'contrast', 'mix', 'note', 'palette', 'token']);
  });

  it('has unique ids and unique formula names', () => {
    const ids = [...project.nodes.map((n) => n.id), ...project.edges.map((e) => e.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const slugs = project.nodes.filter((n) => n.type !== 'note').map((n) => slugify(n.name));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('only connects existing nodes, one edge per input handle', () => {
    const ids = new Set(project.nodes.map((n) => n.id));
    const inputs = new Set<string>();
    for (const e of project.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
      const key = `${e.target}:${e.targetHandle}`;
      expect(inputs.has(key)).toBe(false);
      inputs.add(key);
    }
  });

  it('lays nodes out without overlaps', () => {
    const boxes = project.nodes.map((n) => ({ n, ...n.position, ...footprint(n, project.themes.length) }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.n.name} overlaps ${b.n.name}`).toBe(false);
      }
    }
  });

  it('binds every preview slot to a token', () => {
    const tokenIds = new Set(project.nodes.filter((n) => n.type === 'token').map((n) => n.id));
    const bound = Object.values(project.preview.bindings);
    expect(bound).toHaveLength(10);
    for (const id of bound) expect(tokenIds.has(id!)).toBe(true);
  });

  for (const themeIndex of [0, 1]) {
    it(`computes cleanly in the ${themeIndex === 0 ? 'Light' : 'Dark'} theme`, () => {
      const theme = project.themes[themeIndex];
      const result = computeProject(project, theme.id);
      for (const node of project.nodes) {
        const r = result.nodes[node.id];
        expect(r, node.name).toBeDefined();
        if (r.type === 'color') {
          for (const ch of r.channels) expect(ch.error, `${node.name}.${ch.key}`).toBeUndefined();
          expect(r.warnings, node.name).toEqual([]);
        }
        if (r.type === 'token') expect(r.color, node.name).not.toBeNull();
      }
    });
  }

  it('falls back to Light for status tokens in Dark', () => {
    const result = computeProject(project, dark.id);
    for (const name of ['status/success', 'status/warning', 'status/danger', 'button/bg']) {
      const r = result.nodes[byName(project.nodes, name).id] as TokenResult;
      expect(r.inherited, name).toBe(true);
    }
    const surface = result.nodes[byName(project.nodes, 'bg/surface').id] as TokenResult;
    expect(surface.inherited).toBe(false);
  });

  it('resolves the alias chain button/bg → action/primary → Brand scale 600', () => {
    const result = computeProject(project, light.id);
    const r = result.nodes[byName(project.nodes, 'button/bg').id] as TokenResult;
    expect(r.chain.map((c) => c.label)).toEqual(['button/bg', 'action/primary', 'Brand scale 600']);
  });

  it('keeps On brand readable on Brand', () => {
    const result = computeProject(project, light.id);
    const onBrand = result.nodes[byName(project.nodes, 'On brand').id] as ColorResult;
    const brand = result.nodes[byName(project.nodes, 'Brand').id] as ColorResult;
    expect(wcagContrast(onBrand.color.rgb, brand.color.rgb)).toBeGreaterThanOrEqual(4.5);
    const button = result.nodes[byName(project.nodes, 'Brand button').id] as ContrastResult;
    expect(button.fgConnected && button.bgConnected).toBe(true);
    expect(button.wcag).toBeGreaterThanOrEqual(4.5);
  });

  it('passes the body text check in both themes', () => {
    for (const theme of project.themes) {
      const r = computeProject(project, theme.id).nodes[byName(project.nodes, 'Body text').id] as ContrastResult;
      expect(r.wcag, theme.name).toBeGreaterThanOrEqual(7);
      expect(Math.abs(r.apca), theme.name).toBeGreaterThanOrEqual(75);
    }
  });

  it('shows HSL lightness is not perceptual, OKLCH lightness is', () => {
    const result = computeProject(project, light.id);
    const spread = (prefix: string) => {
      const lum = ['yellow', 'green', 'blue', 'purple'].map(
        (hue) => (result.nodes[byName(project.nodes, `${prefix} ${hue}`).id] as ColorResult).color.luminance,
      );
      return Math.max(...lum) - Math.min(...lum);
    };
    expect(spread('HSL')).toBeGreaterThan(0.4);
    expect(spread('OKLCH')).toBeLessThan(0.1);
    expect(spread('HSL')).toBeGreaterThan(spread('OKLCH') * 5);
  });

  it('mixes the same inputs differently per space', () => {
    const result = computeProject(project, light.id);
    const hex = (name: string) => (result.nodes[byName(project.nodes, name).id] as { color: { hex: string } }).color.hex;
    const outs = new Set([hex('Mix in sRGB'), hex('Mix in OKLab'), hex('Mix in OKLCH')]);
    expect(outs.size).toBe(3);
  });

  it('adapts formula-driven colors to the theme and records @references', () => {
    const accent = byName(project.nodes, 'Adaptive accent');
    const inLight = computeProject(project, light.id);
    const inDark = computeProject(project, dark.id);
    const l = (r: typeof inLight) => (r.nodes[accent.id] as ColorResult).values.l;
    expect(l(inLight)).toBe(52);
    expect(l(inDark)).toBe(74);
    const brand = byName(project.nodes, 'Brand');
    const fromBrand = inLight.refs.filter((r) => r.source === brand.id).map((r) => r.target);
    expect(fromBrand).toContain(accent.id);
    expect(fromBrand).toContain(byName(project.nodes, 'Readable on brand').id);
  });

  it('creates fresh ids on every call', () => {
    const again = createSampleProject();
    expect(again.id).not.toBe(project.id);
    const ids = new Set(project.nodes.map((n) => n.id));
    expect(again.nodes.some((n) => ids.has(n.id))).toBe(false);
  });
});
