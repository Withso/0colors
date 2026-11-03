import { describe, expect, it } from 'vitest';
import { type ColorResult, computeProject, outputColor, outputNative } from './compute';
import { NODE_LABELS, createBlankProject, createColorNode, createHtmlNode, createNode, makeEdge, uniqueName } from './defaults';
import { exportProject } from './export';
import { hasOutput, inputHandles, isAnnotation, isHtmlDoc } from './model';
import { normalizeProject, serializeProject } from './schema';
import { formulaCompletions } from './formula-service';

const position = { x: 40, y: 80 };

describe('HTML frames', () => {
  it('creates the contracted default annotation and generic welcome frame', () => {
    const html = createHtmlNode({ doc: 'spaces', position });
    expect(html).toMatchObject({ type: 'html', name: 'HTML frame', position, data: { doc: 'spaces', width: 960, height: 560 } });
    expect(html.id).toMatch(/^n_/);
    expect(NODE_LABELS.html).toBe('HTML frame');
    expect(createNode('html', position, []).data).toEqual({ doc: 'welcome', width: 960, height: 560 });
    expect(inputHandles(html, [])).toEqual([]);
    expect(hasOutput('html')).toBe(false);
    expect(isAnnotation('html')).toBe(true);
  });

  it('preserves explicit identity, size, position and title', () => {
    expect(createHtmlNode({ doc: 'derive', position, id: 'doc', name: 'Inheritance', width: 800, height: 420 })).toEqual({
      id: 'doc', name: 'Inheritance', type: 'html', position, data: { doc: 'derive', width: 800, height: 420 },
    });
  });

  it('round-trips through JSON and normalizes dimensions', () => {
    const p = createBlankProject();
    p.nodes.push(createHtmlNode({ doc: 'logic', position }));
    expect(normalizeProject(JSON.parse(serializeProject(p)))).toEqual(p);
    const raw = { id: 'doc', type: 'html', position, data: { doc: 'welcome', width: -1, height: 5000 } };
    expect(normalizeProject({ nodes: [raw] }).nodes[0].data).toEqual({ doc: 'welcome', width: 240, height: 4000 });
    raw.data.width = 5000; raw.data.height = -1;
    expect(normalizeProject({ nodes: [raw] }).nodes[0].data).toEqual({ doc: 'welcome', width: 4000, height: 160 });
    expect(normalizeProject({ nodes: [{ ...raw, data: { doc: 'welcome' } }] }).nodes[0].data).toEqual({ doc: 'welcome', width: 960, height: 560 });
    expect(normalizeProject({ nodes: [{ ...raw, data: { doc: 'welcome', width: NaN, height: Infinity } }] }).nodes[0].data).toEqual({ doc: 'welcome', width: 960, height: 560 });
  });

  it.each(['', 'Welcome', '../welcome', 'a/b', 'https://example.com', 'welcome.html', 'welcome?x', '<svg>', ' spaced ', 'a'.repeat(65), undefined, null, 4])('drops an invalid document id: %s', (doc) => {
    expect(isHtmlDoc(doc)).toBe(false);
    expect(normalizeProject({ nodes: [{ id: 'doc', type: 'html', position, data: { doc } }] }).nodes).toEqual([]);
  });

  it.each(['welcome', 'color-spaces-2', 'a', 'a'.repeat(64)])('accepts the built-in document id format: %s', (doc) => {
    expect(isHtmlDoc(doc)).toBe(true);
    expect(normalizeProject({ nodes: [{ id: 'doc', type: 'html', position, data: { doc } }] }).nodes[0].data).toMatchObject({ doc });
  });

  it('drops edges to and from HTML frames during normalization', () => {
    const p = createBlankProject();
    const html = createHtmlNode({ id: 'doc', doc: 'welcome', position });
    p.nodes.push(html);
    p.edges.push(makeEdge(p.nodes[0].id, 'out', html.id, 'in'), makeEdge(html.id, 'out', p.nodes[0].id, 'in'));
    expect(normalizeProject(p).edges).toEqual([]);
  });

  it('does not claim formula names, produce output or appear in completion', () => {
    const html = createHtmlNode({ id: 'doc', doc: 'welcome', name: 'Brand', position });
    const p = createBlankProject();
    p.nodes.unshift(html);
    p.nodes.push(createColorNode({ id: 'derived', name: 'Derived', position, rules: { l: { mode: 'formula', expr: '@brand.l' } } }));
    const result = computeProject(p);
    expect(result.nodes.doc).toEqual({ type: 'html' });
    expect(outputColor(result.nodes.doc)).toBeNull();
    expect(outputNative(result.nodes.doc)).toBeUndefined();
    expect((result.nodes.derived as ColorResult).channels.find((c) => c.key === 'l')?.error).toBeUndefined();
    expect(result.refs[0].source).toBe(p.nodes[1].id);
    expect(uniqueName([html], 'Brand')).toBe('Brand');
    expect(formulaCompletions('@', 1, { space: 'oklch', channel: 'l', hasParent: false, nodes: [{ slug: 'brand', name: 'Brand', type: 'html' }] })).toBeNull();
  });

  it.each(['css', 'tailwind', 'dtcg', 'json'] as const)('ignores HTML frames in %s export', (format) => {
    const p = createBlankProject();
    const options = { format, colorFormat: 'hex' as const, includePrimitives: true, useAliases: true };
    const before = exportProject(p, options);
    p.nodes.unshift(createHtmlNode({ doc: 'welcome', position, name: 'Brand' }));
    expect(exportProject(p, options)).toBe(before);
  });
});
