import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Project, tokenHandle } from './model';
import { createBlankProject, createColorNode, createPaletteNode, createTokenNode, makeEdge } from './defaults';
import { decodeShare, encodeShare, readShareCode, shareUrl } from './share';

function sample(name = 'Shared canvas'): Project {
  const base = createBlankProject(name);
  const light = base.themes[0].id;
  const palette = createPaletteNode({ name: 'Neutral', position: { x: 300, y: 0 } });
  const token = createTokenNode({ name: 'bg/surface', position: { x: 600, y: 0 } });
  const child = createColorNode({ name: 'Brand hover', position: { x: 300, y: 300 }, rules: { l: { mode: 'offset', delta: -8 } } });
  return {
    ...base,
    nodes: [...base.nodes, palette, token, child],
    edges: [makeEdge(palette.id, 's0', token.id, tokenHandle(light)), makeEdge(base.nodes[0].id, 'out', child.id, 'in')],
    viewport: { x: 10, y: 20, zoom: 0.8 },
  };
}

const b64url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('share links', () => {
  it('round-trips a compressed project under a new id', async () => {
    const p = sample();
    const code = await encodeShare(p);
    expect(code[0]).toBe('z');
    const back = await decodeShare(code);
    expect(back.id).not.toBe(p.id);
    expect(back.name).toBe(p.name);
    expect(back.nodes).toEqual(p.nodes);
    expect(back.edges).toEqual(p.edges);
    expect(back.themes).toEqual(p.themes);
    expect(back.viewport).toEqual(p.viewport);
  });

  it('falls back to plain JSON without CompressionStream', async () => {
    const p = sample();
    vi.stubGlobal('CompressionStream', undefined);
    const code = await encodeShare(p);
    vi.unstubAllGlobals();
    expect(code[0]).toBe('j');
    expect((await decodeShare(code)).nodes).toEqual(p.nodes);
  });

  it('compresses better than plain JSON', async () => {
    const p = sample();
    const zipped = await encodeShare(p);
    vi.stubGlobal('CompressionStream', undefined);
    const plain = await encodeShare(p);
    expect(zipped.length).toBeLessThan(plain.length);
  });

  it('keeps non-ASCII text intact', async () => {
    const back = await decodeShare(await encodeShare(sample('Café ☕ 色 — ünïcødé')));
    expect(back.name).toBe('Café ☕ 色 — ünïcødé');
  });

  it('rejects damaged links with a friendly message', async () => {
    await expect(decodeShare('')).rejects.toThrow(/incomplete or damaged/);
    await expect(decodeShare('x123')).rejects.toThrow(/incomplete or damaged/);
    await expect(decodeShare('z!!!')).rejects.toThrow(/incomplete or damaged/);
    await expect(decodeShare('zAAAAAAAA')).rejects.toThrow(/incomplete or damaged/);
    await expect(decodeShare('j' + b64url('not json'))).rejects.toThrow(/incomplete or damaged/);
    await expect(decodeShare('j' + b64url('{"foo":1}'))).rejects.toThrow(/not a 0colors project/);
  });

  it('builds and reads share URLs', () => {
    expect(shareUrl('https://0colors.app/', 'zabc')).toBe('https://0colors.app/#s=zabc');
    expect(shareUrl('http://localhost:3000', 'jxyz')).toBe('http://localhost:3000/#s=jxyz');
    expect(readShareCode('#s=zabc')).toBe('zabc');
    expect(readShareCode('s=zabc')).toBe('zabc');
    expect(readShareCode('#foo=1&s=z-_9')).toBe('z-_9');
    expect(readShareCode('#foo=1')).toBeNull();
    expect(readShareCode('')).toBeNull();
    expect(readShareCode('#s=z')).toBeNull();
  });
});
