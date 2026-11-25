import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColorResult } from '@/engine/compute';
import { createColorNode, makeEdge } from '@/engine/defaults';
import type { CanvasNode, ColorNode, Edge, Project, Theme } from '@/engine/model';
import { deleteSelection, moveNodes, renameNode, setColorSpace } from './actions';
import { getEditor } from './store';

const at = { x: 0, y: 0 };
const LIGHT: Theme = { id: 'light', name: 'Light', dark: false };

function project(nodes: CanvasNode[], edges: Edge[] = []): Project {
  return { schema: 2, id: 'p', name: 'Test', createdAt: 0, updatedAt: 0, themes: [LIGHT], nodes, edges, preview: { bindings: {} } };
}

function color(id: string, rules: ColorNode['data']['rules'] = {}) {
  return createColorNode({ id, name: id, position: at, space: 'oklch', values: { l: 50, c: 0.1, h: 250, alpha: 100 }, rules });
}

function edge(id: string, source: string, target: string): Edge {
  return { ...makeEdge(source, 'out', target, 'in'), id };
}

function loadFormulaColor() {
  const parent = createColorNode({
    id: 'parent', name: 'Parent', position: at, space: 'oklch', values: { l: 60, c: 0.2, h: 250, alpha: 80 },
  });
  const child = createColorNode({
    id: 'child', name: 'Child', position: at, space: 'oklch', values: { l: 30, c: 0.05, h: 100, alpha: 100 },
    rules: {
      c: { mode: 'formula', expr: 'parent.c * 0.5' },
      h: { mode: 'offset', delta: 12, expr: 'parent.h + 12' },
      alpha: { mode: 'offset', delta: -20 },
    },
  });
  getEditor().load(project([parent, child], [edge('e', 'parent', 'child')]));
}

const childNode = () => getEditor().project.nodes.find((n) => n.id === 'child') as ColorNode;

describe('moveNodes undo coalescing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    getEditor().load(project([color('a')]));
  });

  afterEach(() => { vi.useRealTimers(); });

  it('merges keyboard nudges only inside the normal coalesce window', () => {
    moveNodes([{ id: 'a', position: { x: 8, y: 0 } }]);
    moveNodes([{ id: 'a', position: { x: 16, y: 0 } }]);
    vi.setSystemTime(1300);
    moveNodes([{ id: 'a', position: { x: 24, y: 0 } }]);
    getEditor().undo();
    expect(getEditor().project.nodes[0].position.x).toBe(16);
  });

  it('still merges one explicit drag gesture across longer pauses', () => {
    moveNodes([{ id: 'a', position: { x: 8, y: 0 } }], 'drag:a');
    vi.setSystemTime(5000);
    moveNodes([{ id: 'a', position: { x: 16, y: 0 } }], 'drag:a');
    getEditor().undo();
    expect(getEditor().project.nodes[0].position.x).toBe(0);
  });
});

describe('deleteSelection', () => {
  it('deletes a mixed node and edge selection atomically', () => {
    const nodes = ['a', 'b', 'c', 'd'].map((id) => color(id));
    getEditor().load(project(nodes, [edge('e1', 'a', 'b'), edge('e2', 'c', 'd')]));
    getEditor().select(['b'], ['e2']);
    deleteSelection();
    expect(getEditor().project.nodes.map((n) => n.id)).toEqual(['a', 'c', 'd']);
    expect(getEditor().project.edges).toEqual([]);
    expect(getEditor().selection).toEqual([]);
    expect(getEditor().edgeSelection).toEqual([]);
    getEditor().undo();
    expect(getEditor().project.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(getEditor().project.edges.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('still deletes an edge-only selection', () => {
    getEditor().load(project([color('a'), color('b')], [edge('e1', 'a', 'b')]));
    getEditor().select([], ['e1']);
    deleteSelection();
    expect(getEditor().project.nodes).toHaveLength(2);
    expect(getEditor().project.edges).toEqual([]);
  });
});

describe('setColorSpace', () => {
  it('converts a first visit without formulas, then restores the remembered space exactly', () => {
    loadFormulaColor();
    setColorSpace('child', 'hsl');

    let child = childNode();
    expect(child.data.space).toBe('hsl');
    for (const key of ['h', 's', 'l']) expect(child.data.rules[key]?.mode).toBe('offset');
    for (const key of ['h', 's', 'l']) expect(child.data.rules[key]?.expr).toBeUndefined();
    expect(child.data.rules.c).toBeUndefined();
    expect(child.data.rules.alpha).toEqual({ mode: 'offset', delta: -20 });
    expect(child.data.values.alpha).toBe(60);
    expect(child.data.spaceMemory?.hsl).toBeUndefined();
    expect(child.data.spaceMemory?.oklch).toEqual({
      values: { l: 30, c: 0.05, h: 100 },
      rules: {
        c: { mode: 'formula', expr: 'parent.c * 0.5' },
        h: { mode: 'offset', delta: 12, expr: 'parent.h + 12' },
      },
    });

    setColorSpace('child', 'oklch');
    child = childNode();
    expect(child.data.values).toEqual({ l: 30, c: 0.05, h: 100, alpha: 60 });
    expect(child.data.rules).toEqual({
      c: { mode: 'formula', expr: 'parent.c * 0.5' },
      h: { mode: 'offset', delta: 12, expr: 'parent.h + 12' },
      alpha: { mode: 'offset', delta: -20 },
    });
    expect(child.data.spaceMemory?.oklch).toBeUndefined();
    expect(child.data.spaceMemory?.hsl).toBeDefined();
    expect(child.data.spaceMemory?.hsl?.values.alpha).toBeUndefined();
    const result = getEditor().result.nodes.child as ColorResult;
    const chroma = result.channels.find((c) => c.key === 'c');
    expect(chroma).toMatchObject({ mode: 'formula', expr: 'parent.c * 0.5' });
    expect(chroma?.error).toBeUndefined();
  });

  it('renames references inside remembered formulas', () => {
    const parent = createColorNode({ id: 'parent', name: 'Parent', position: at, values: { l: 60, c: 0.2, h: 250, alpha: 100 } });
    const child = createColorNode({
      id: 'child', name: 'Child', position: at, values: { l: 30, c: 0.05, h: 100, alpha: 100 },
      rules: { c: { mode: 'formula', expr: '@parent.c * 0.5' } },
    });
    getEditor().load(project([parent, child], [edge('e', 'parent', 'child')]));
    setColorSpace('child', 'hsl');
    renameNode('parent', 'Renamed');
    expect(childNode().data.spaceMemory?.oklch?.rules.c.expr).toBe('@renamed.c * 0.5');
  });
});
