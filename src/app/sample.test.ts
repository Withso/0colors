import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { SAMPLE_ID, createSampleProject, estimateNoteHeight, isSampleId } from './sample';
import { computeProject, type ColorResult, type ContrastResult, type TokenResult } from '@/engine/compute';
import { type CanvasNode, type SectionNode, PREVIEW_SLOTS, isAnnotation, slugify } from '@/engine/model';
import { wcagContrast } from '@/engine/color/contrast';
import { createBlankProject } from '@/engine/defaults';
import { encodeShare } from '@/engine/share';
import { bootProject, createCanvas, deleteCanvas, listCanvases, openCanvas, resetSample, saveNow, startAutosave } from './persist';
import { getEditor } from './store';

const byName = (nodes: CanvasNode[], name: string) => {
  const n = nodes.find((node) => node.name === name);
  if (!n) throw new Error(`missing node ${name}`);
  return n;
};

// Rendered size contract; notes deliberately use a conservative word-wrap estimate.
function footprint(n: CanvasNode, themes: number): { w: number; h: number } {
  switch (n.type) {
    case 'color': return { w: 208, h: 156 };
    case 'palette': return { w: 228, h: 44 + n.data.steps * 22 };
    case 'mix': return { w: 228, h: 196 };
    case 'contrast': return { w: 248, h: 206 };
    case 'token': return { w: 228, h: 44 + themes * 30 };
    case 'note': return { w: n.data.width, h: estimateNoteHeight(n.data.text, n.data.width) };
    case 'section': return { w: n.data.width, h: n.data.height };
    case 'html': return { w: n.data.width, h: n.data.height };
  }
}

describe('createSampleProject', () => {
  const project = createSampleProject();
  const [light, dark] = project.themes;
  const sections = project.nodes.filter((n): n is SectionNode => n.type === 'section');

  it('is a well-formed project with two themes', () => {
    expect(project.schema).toBe(2);
    expect(project.name).toBe('0colors sample');
    expect(project.themes.map((t) => [t.name, t.dark])).toEqual([['Light', false], ['Dark', true]]);
  });

  it('includes every node type', () => {
    const types = new Set(project.nodes.map((n) => n.type));
    expect([...types].sort()).toEqual(['color', 'contrast', 'html', 'mix', 'note', 'palette', 'section', 'token']);
  });

  it('has unique ids and unique formula names', () => {
    const ids = [...project.nodes.map((n) => n.id), ...project.edges.map((e) => e.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const slugs = project.nodes.filter((n) => !isAnnotation(n.type)).map((n) => slugify(n.name));
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

  it('has a complete, ordered tour with consistent section columns', () => {
    expect(sections.map((s) => s.name)).toEqual([
      'Start here', '1 · Color spaces', '2 · Inheritance & rules', '3 · Palettes', '4 · Mixing',
      '5 · Contrast', '6 · Tokens & themes', '7 · Logic', '8 · Glossary', '9 · Canvas basics',
    ]);
    expect(new Set(sections.map((s) => s.data.width)).size).toBe(1);
    expect(new Set(sections.map((s) => s.position.x)).size).toBe(3);
  });

  it('pairs the landing hero with a live experiment in the first section', () => {
    const hero = project.nodes.find((n) => n.type === 'html' && n.data.doc === 'welcome');
    expect(hero?.position).toEqual({ x: 40, y: 84 });
    const play = byName(project.nodes, 'Play color');
    const tint = byName(project.nodes, 'Play tint');
    expect(project.edges.some((e) => e.source === play.id && e.target === tint.id)).toBe(true);
    expect(play.position.y + footprint(play, 2).h).toBeLessThan(900);
    expect(tint.position.y + footprint(tint, 2).h).toBeLessThan(900);
  });

  it('serves every tutorial as a self-contained, script-free page with native actions kept outside HTML', () => {
    const frames = project.nodes.filter((n) => n.type === 'html');
    expect(frames.map((n) => n.data.doc).sort()).toEqual(['canvas', 'derive', 'logic', 'spaces', 'themes', 'welcome']);
    for (const frame of frames) {
      const html = readFileSync(new URL(`../../public/tutorials/${frame.data.doc}.html`, import.meta.url), 'utf8');
      expect(html, frame.data.doc).toMatch(/<!doctype html>/i);
      expect(html, frame.data.doc).toContain('prefers-color-scheme: dark');
      expect(html, frame.data.doc).toContain('overflow: hidden');
      expect(html, frame.data.doc).toContain('ui-sans-serif, system-ui');
      expect(html, frame.data.doc).not.toMatch(/<(?:script|a|button|link|iframe|object|embed|form)\b/i);
      expect(html, frame.data.doc).not.toMatch(/\b(?:src|href|onload|onclick)\s*=/i);
      expect(html, frame.data.doc).not.toMatch(/@import|url\(\s*['"]?(?:https?:|\/\/)/i);
    }
  });

  it('contains every non-section node fully in exactly one padded section', () => {
    for (const node of project.nodes.filter((n) => n.type !== 'section')) {
      const size = footprint(node, project.themes.length);
      const containers = sections.filter((s) => node.position.x >= s.position.x && node.position.y >= s.position.y
        && node.position.x + size.w <= s.position.x + s.data.width && node.position.y + size.h <= s.position.y + s.data.height);
      expect(containers, `${node.name}: ${node.type}`).toHaveLength(1);
      const s = containers[0];
      expect(node.position.x, node.name).toBeGreaterThanOrEqual(s.position.x + 40);
      expect(node.position.y, node.name).toBeGreaterThanOrEqual(s.position.y + 84);
      expect(node.position.x + size.w, node.name).toBeLessThanOrEqual(s.position.x + s.data.width - 40);
      expect(node.position.y + size.h, node.name).toBeLessThanOrEqual(s.position.y + s.data.height - 40);
    }
  });

  it('keeps sections separated by visible gutters', () => {
    for (let i = 0; i < sections.length; i++) {
      for (let j = i + 1; j < sections.length; j++) {
        const a = sections[i];
        const b = sections[j];
        const separated = a.position.x + a.data.width + 80 <= b.position.x || b.position.x + b.data.width + 80 <= a.position.x
          || a.position.y + a.data.height + 80 <= b.position.y || b.position.y + b.data.height + 80 <= a.position.y;
        expect(separated, `${a.name} overlaps or crowds ${b.name}`).toBe(true);
      }
    }
  });

  it('keeps each live graph inside its lesson, without wires crossing other sections', () => {
    const owner = new Map(project.nodes.filter((n) => n.type !== 'section').map((n) => [n.id, sections.find((s) =>
      n.position.x >= s.position.x && n.position.x < s.position.x + s.data.width
      && n.position.y >= s.position.y && n.position.y < s.position.y + s.data.height)?.id]));
    for (const theme of project.themes) {
      const links = [...project.edges, ...computeProject(project, theme.id).refs];
      for (const link of links) {
        expect(owner.get(link.source), `source of ${link.id}`).toBeDefined();
        expect(owner.get(link.target), `connection ${link.id} leaves its section`).toBe(owner.get(link.source));
      }
    }
  });

  it('lays every section’s contents out without overlaps', () => {
    const boxes = project.nodes.filter((n) => n.type !== 'section').map((n) => ({ n, ...n.position, ...footprint(n, project.themes.length) }));
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
    expect(Object.keys(project.preview.bindings).sort()).toEqual([...PREVIEW_SLOTS].sort());
    for (const id of bound) expect(tokenIds.has(id!)).toBe(true);
  });

  it('moves every glossary term onto the canvas as its own note', () => {
    const glossary = sections.find((s) => s.name === '8 · Glossary')!;
    const notes = project.nodes.filter((n) => n.type === 'note' && n.position.x >= glossary.position.x && n.position.x < glossary.position.x + glossary.data.width
      && n.position.y >= glossary.position.y && n.position.y < glossary.position.y + glossary.data.height);
    const text = notes.map((n) => n.type === 'note' ? n.data.text : '');
    for (const term of ['Hue', 'Chroma vs saturation', 'Lightness vs tone', 'OKLCH', 'HCT', 'HSL', 'sRGB gamut', 'Relative luminance', 'WCAG contrast', 'APCA', 'Primitive token', 'Semantic token', 'Alias']) {
      expect(text.filter((t) => t.startsWith(`**${term}**\n`)), term).toHaveLength(1);
    }
  });

  it('demonstrates multiline local color, number and boolean values with explanatory steps', () => {
    const node = byName(project.nodes, 'Readable on brand');
    expect(node.type).toBe('color');
    if (node.type !== 'color') return;
    expect(node.data.rules.l.expr).toContain('//');
    expect(node.data.rules.l.expr).toContain('if readable then');
    for (const theme of project.themes) {
      const result = computeProject(project, theme.id).nodes[node.id] as ColorResult;
      const trace = result.channels.find((ch) => ch.key === 'l')!;
      expect(trace.error).toBeUndefined();
      expect(trace.explain?.steps.map((s) => s.name)).toEqual(['base', 'ratio', 'readable', null]);
      expect(trace.value).toBe(98);
    }
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
          // Gamut mapping is taught by palettes and the OKLCH mix, not incidental color warnings.
          expect(r.color.inGamut, node.name).toBe(true);
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

  it('resolves the alias chain button/bg → action/primary → Theme brand 600', () => {
    const result = computeProject(project, light.id);
    const r = result.nodes[byName(project.nodes, 'button/bg').id] as TokenResult;
    expect(r.chain.map((c) => c.label)).toEqual(['button/bg', 'action/primary', 'Theme brand 600']);
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
    const brand = byName(project.nodes, 'Logic brand');
    const fromBrand = inLight.refs.filter((r) => r.source === brand.id).map((r) => r.target);
    expect(fromBrand).toContain(accent.id);
    expect(fromBrand).toContain(byName(project.nodes, 'Readable on brand').id);
  });

  it('keeps the protected project id while rebuilding every node with fresh ids', () => {
    const again = createSampleProject();
    expect(project.id).toBe(SAMPLE_ID);
    expect(again.id).toBe(SAMPLE_ID);
    expect(isSampleId(again.id)).toBe(true);
    expect(isSampleId('sample-copy')).toBe(false);
    const ids = new Set(project.nodes.map((n) => n.id));
    expect(again.nodes.some((n) => ids.has(n.id))).toBe(false);
  });
});

describe('protected demo persistence', () => {
  let records: Map<string, string>;
  let stopAutosave: (() => void) | undefined;
  const read = (key: string) => JSON.parse(records.get(`0colors:kv:${key}`) ?? 'null');

  beforeEach(() => {
    records = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => { records.set(key, value); },
      removeItem: (key: string) => { records.delete(key); },
    });
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', new EventTarget());
    getEditor().load(createSampleProject());
  });

  afterEach(async () => {
    if (stopAutosave) {
      await saveNow();
      stopAutosave();
      stopAutosave = undefined;
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens the demo on first run and pins it exactly once', async () => {
    const opened = await bootProject();
    expect(opened.source).toBe('sample');
    expect(opened.project.id).toBe(SAMPLE_ID);
    const list = await listCanvases();
    expect(list[0]).toMatchObject({ id: SAMPLE_ID, sample: true });
    expect(list.filter((c) => c.sample)).toHaveLength(1);
    expect(read('canvas:sample').id).toBe(SAMPLE_ID);
  });

  it('repairs a missing demo without replacing the last-opened personal canvas', async () => {
    const personal = createBlankProject('My work');
    getEditor().load(personal);
    await saveNow();
    const opened = await bootProject();
    expect(opened.project.id).toBe(personal.id);
    expect(read('last')).toBe(personal.id);
    const list = await listCanvases();
    expect(list.map((c) => c.id)).toEqual([SAMPLE_ID, personal.id]);
    expect(list[1].sample).toBe(false);
  });

  it('preserves edits to the demo across boots', async () => {
    getEditor().update((d) => { d.name = 'My edited demo'; d.nodes.pop(); });
    const count = getEditor().project.nodes.length;
    await saveNow();
    const opened = await bootProject();
    expect(opened.project.name).toBe('My edited demo');
    expect(opened.project.nodes).toHaveLength(count);
    expect((await listCanvases())[0].name).toBe('My edited demo');
  });

  it('repairs a missing demo index entry and an unreadable demo record', async () => {
    await bootProject();
    records.delete('0colors:kv:canvases');
    expect((await listCanvases())[0].sample).toBe(true);
    records.set('0colors:kv:canvas:sample', JSON.stringify({ damaged: true }));
    const opened = await bootProject();
    expect(opened.project.id).toBe(SAMPLE_ID);
    expect(opened.project.nodes.length).toBeGreaterThan(0);
  });

  it('rejects demo deletion without changing the editor or stored record', async () => {
    await bootProject();
    const before = read('canvas:sample');
    await expect(deleteCanvas(SAMPLE_ID)).rejects.toThrow('The demo can’t be deleted — reset it instead.');
    expect(read('canvas:sample')).toEqual(before);
    expect(getEditor().project.id).toBe(SAMPLE_ID);
  });

  it('reset drops pending demo edits and clears the old undo history', async () => {
    vi.useFakeTimers();
    stopAutosave = startAutosave();
    getEditor().update((d) => { d.name = 'Unsaved edits'; d.nodes = []; });
    await resetSample();
    expect(getEditor().project.id).toBe(SAMPLE_ID);
    expect(getEditor().project.name).toBe('0colors sample');
    expect(getEditor().past).toEqual([]);
    await vi.advanceTimersByTimeAsync(600);
    await saveNow();
    const opened = await bootProject();
    expect(opened.project.name).toBe('0colors sample');
    expect(opened.project.nodes.length).toBeGreaterThan(0);
  });

  it('reset opens the demo and saves pending edits to another canvas', async () => {
    const personal = createBlankProject('My work');
    getEditor().load(personal);
    stopAutosave = startAutosave();
    getEditor().update((d) => { d.name = 'Latest work'; });
    await resetSample();
    expect(getEditor().project.id).toBe(SAMPLE_ID);
    await openCanvas(personal.id);
    expect(getEditor().project.name).toBe('Latest work');
  });

  it('reset wins over an already queued autosave of the old demo', async () => {
    stopAutosave = startAutosave();
    getEditor().update((d) => { d.name = 'Old queued copy'; });
    const saving = saveNow();
    const resetting = resetSample();
    await Promise.all([saving, resetting]);
    expect(read('canvas:sample').name).toBe('0colors sample');
    expect(getEditor().project.name).toBe('0colors sample');
  });

  it('imports always get fresh ids, including repeated imports and the demo id', async () => {
    const original = getEditor().project;
    await saveNow();
    await createCanvas({ ...original, name: 'Imported demo' });
    const first = getEditor().project.id;
    expect(first).not.toBe(SAMPLE_ID);
    await createCanvas({ ...getEditor().project, name: 'Second import' });
    expect(getEditor().project.id).not.toBe(first);
    expect(read('canvas:sample').name).toBe('0colors sample');
    expect(read(`canvas:${first}`).name).toBe('Imported demo');
    expect((await listCanvases())[0].id).toBe(SAMPLE_ID);
  });

  it('a share link opens a fresh copy and leaves the protected demo intact', async () => {
    const original = getEditor().project;
    await saveNow();
    const code = await encodeShare({ ...original, name: 'Shared changes' });
    vi.stubGlobal('location', { hash: `#s=${code}`, pathname: '/', search: '' });
    const replaceState = vi.fn();
    vi.stubGlobal('history', { replaceState });
    const opened = await bootProject();
    expect(opened.source).toBe('share');
    expect(opened.project.id).not.toBe(SAMPLE_ID);
    expect(opened.project.name).toBe('Shared changes');
    expect(read('canvas:sample').name).toBe('0colors sample');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('deleting the last personal canvas returns to the permanent demo', async () => {
    await bootProject();
    await createCanvas(createBlankProject());
    const id = getEditor().project.id;
    await deleteCanvas(id);
    expect(getEditor().project.id).toBe(SAMPLE_ID);
    expect((await listCanvases()).map((c) => c.id)).toEqual([SAMPLE_ID]);
  });
});
