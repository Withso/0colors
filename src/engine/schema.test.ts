import { describe, expect, it } from 'vitest';
import { type ColorNode, type MixNode, type NoteNode, type PaletteNode, type Project, type TokenNode, tokenHandle } from './model';
import { createBlankProject, createColorNode, createPaletteNode, createTokenNode, makeEdge } from './defaults';
import { normalizeProject, serializeProject } from './schema';

const at = { x: 1, y: 2 };

describe('normalizeProject', () => {
  it('rejects things that are not projects', () => {
    for (const bad of [null, 42, 'x', [], {}, { nodes: {} }]) {
      expect(() => normalizeProject(bad)).toThrow('This file is not a 0colors project.');
    }
  });

  it('rejects other schema versions', () => {
    expect(() => normalizeProject({ schema: 1, nodes: [] })).toThrow(/unsupported format/);
  });

  it('fills in a minimal project', () => {
    const p = normalizeProject({ nodes: [] });
    expect(p.schema).toBe(2);
    expect(p.id).toMatch(/^p_/);
    expect(p.name).toBe('Untitled canvas');
    expect(p.themes.length).toBeGreaterThanOrEqual(1);
    expect(p.edges).toEqual([]);
    expect(p.preview).toEqual({ bindings: {} });
    expect(typeof p.createdAt).toBe('number');
    expect('viewport' in p).toBe(false);
  });

  it('leaves a valid project unchanged', () => {
    const base = createBlankProject('Round trip');
    const light = base.themes[0].id;
    const palette = createPaletteNode({ name: 'Neutral', position: { x: 300, y: 0 } });
    const token = createTokenNode({ name: 'bg/surface', position: { x: 600, y: 0 }, description: 'Background' });
    const child = createColorNode({ name: 'Child', position: { x: 0, y: 200 }, rules: { l: { mode: 'offset', delta: -10 }, h: { mode: 'formula', expr: 'parent.h + 30' } } });
    const p: Project = {
      ...base,
      nodes: [...base.nodes, palette, token, child],
      edges: [makeEdge(palette.id, 's3', token.id, tokenHandle(light)), makeEdge(base.nodes[0].id, 'out', child.id, 'in')],
      preview: { bindings: { background: token.id } },
      viewport: { x: 1, y: 2, zoom: 1.5 },
    };
    expect(normalizeProject(JSON.parse(serializeProject(p)))).toEqual(p);
  });

  it('drops unknown types, bad positions, missing ids and duplicate ids', () => {
    const p = normalizeProject({
      nodes: [
        { id: 'a', type: 'weird', position: at },
        { id: 'b', type: 'color', position: { x: 'no', y: 0 } },
        { id: 'c', type: 'color', position: at, name: 'Keep me' },
        { type: 'color', position: at },
        { id: 'c', type: 'note', position: at },
        'junk',
      ],
    });
    expect(p.nodes.map((n) => n.id)).toEqual(['c']);
    expect(p.nodes[0].name).toBe('Keep me');
  });

  it('repairs color node data', () => {
    const p = normalizeProject({
      nodes: [{
        id: 'c', type: 'color', position: at, name: 7,
        data: {
          space: 'cmyk',
          values: { l: 'x', c: 0.2, bogus: 3 },
          rules: { l: { mode: 'offset', delta: 5 }, c: { mode: 'nope' }, h: { mode: 'formula', expr: 'parent.h + 1', delta: 'x' }, bogus: { mode: 'fixed' } },
        },
      }],
    });
    const node = p.nodes[0] as ColorNode;
    expect(node.name).toBe('Color');
    expect(node.data.space).toBe('oklch');
    expect(node.data.values.c).toBe(0.2);
    expect(typeof node.data.values.l).toBe('number');
    expect(node.data.values.bogus).toBeUndefined();
    expect(node.data.values.alpha).toBe(100);
    expect(node.data.rules).toEqual({ l: { mode: 'offset', delta: 5 }, h: { mode: 'formula', expr: 'parent.h + 1' } });
  });

  it('fills palette, mix, note and token defaults', () => {
    const p = normalizeProject({
      nodes: [
        { id: 'p', type: 'palette', position: at, data: { steps: 5, curve: 'bogus', naming: 'index', lightStart: 300 } },
        { id: 'p2', type: 'palette', position: at, data: { steps: 1 } },
        { id: 'm', type: 'mix', position: at, data: { a: 'not-a-color', b: '#123', ratio: 4, space: 'cmyk' } },
        { id: 'n', type: 'note', position: at, data: { tone: 'orange', width: 5, text: 'Hi' } },
        { id: 't', type: 'token', position: at, data: { description: 9 } },
      ],
    });
    const [pal, pal2, mix, note, token] = p.nodes as [PaletteNode, PaletteNode, MixNode, NoteNode, TokenNode];
    expect(pal.data.steps).toBe(5);
    expect(pal.data.curve).toBe('linear');
    expect(pal.data.naming).toBe('index');
    expect(pal.data.lightStart).toBe(100);
    expect(pal.data.hue).toBe(255);
    expect(pal2.data.steps).toBe(2);
    expect(mix.data.a).toBe('#2563EB');
    expect(mix.data.b).toBe('#123');
    expect(mix.data.ratio).toBe(1);
    expect(mix.data.space).toBe('oklab');
    expect(note.data).toEqual({ text: 'Hi', tone: 'yellow', width: 120 });
    expect(token.data.description).toBe('');
    expect(token.name).toBe('color/token');
  });

  it('cleans up edges', () => {
    const themes = [{ id: 'light', name: 'Light', dark: false }, { id: 'dark', name: 'Dark', dark: true }];
    const node = (id: string, type: string, data: object = {}) => ({ id, type, position: at, data });
    const p = normalizeProject({
      themes,
      nodes: [node('a', 'color'), node('b', 'color'), node('b2', 'color'), node('n', 'note'), node('p', 'palette', { steps: 3 }), node('t', 'token'), node('c', 'contrast')],
      edges: [
        { id: 'e1', source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' },
        { id: 'e2', source: 'zzz', sourceHandle: 'out', target: 'b', targetHandle: 'in' },
        { id: 'e3', source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'nope' },
        { id: 'e4', source: 'n', sourceHandle: 'out', target: 'b2', targetHandle: 'in' },
        { id: 'e5', source: 'c', sourceHandle: 'out', target: 'b2', targetHandle: 'in' },
        { id: 'e6', source: 'p', sourceHandle: 's5', target: 't', targetHandle: 't:light' },
        { id: 'e7', source: 'p', sourceHandle: 's2', target: 't', targetHandle: 't:light' },
        { id: 'e8', source: 'a', sourceHandle: 'out', target: 't', targetHandle: 't:unknown' },
        { id: 'e9', source: 'b', sourceHandle: 'out', target: 'a', targetHandle: 'in' },
        { id: 'e10', source: 'p', sourceHandle: 's0', target: 't', targetHandle: 't:light' },
        { id: 'e1', source: 'a', target: 'b2' },
        { id: 'e12', source: 'a', sourceHandle: 'nope', target: 't', targetHandle: 't:dark' },
      ],
    });
    expect(p.edges.map((e) => `${e.source}:${e.sourceHandle}->${e.target}:${e.targetHandle}`).sort()).toEqual([
      'a:out->b2:in',
      'a:out->b:in',
      'p:s0->t:t:light',
    ]);
    expect(new Set(p.edges.map((e) => e.id)).size).toBe(3);
  });

  it('keeps only valid preview bindings', () => {
    const p = normalizeProject({
      nodes: [{ id: 't', type: 'token', position: at }, { id: 'a', type: 'color', position: at }],
      preview: { bindings: { background: 't', surface: 'a', bogusSlot: 't', text: 'missing' } },
    });
    expect(p.preview.bindings).toEqual({ background: 't' });
  });

  it('keeps a finite viewport only', () => {
    expect(normalizeProject({ nodes: [], viewport: { x: 1, y: 2, zoom: 1.5 } }).viewport).toEqual({ x: 1, y: 2, zoom: 1.5 });
    expect(normalizeProject({ nodes: [], viewport: { x: 1, y: 2, zoom: 0 } }).viewport).toBeUndefined();
    expect(normalizeProject({ nodes: [], viewport: { x: '1', y: 2, zoom: 1 } }).viewport).toBeUndefined();
  });

  it('dedupes theme ids and names unnamed themes', () => {
    const p = normalizeProject({
      nodes: [],
      themes: [{ id: 'x', name: 'A' }, { id: 'x', name: 'B', dark: true }, 'junk', { name: '' }],
    });
    expect(p.themes.map((t) => t.name)).toEqual(['A', 'B', 'Theme 3']);
    expect(p.themes.map((t) => t.dark)).toEqual([false, true, false]);
    expect(new Set(p.themes.map((t) => t.id)).size).toBe(3);
    expect(p.themes[0].id).toBe('x');
  });
});

describe('serializeProject', () => {
  it('writes pretty JSON', () => {
    const json = serializeProject(createBlankProject('Pretty'));
    expect(json).toContain('\n  "schema": 2');
    expect(JSON.parse(json).name).toBe('Pretty');
  });
});
