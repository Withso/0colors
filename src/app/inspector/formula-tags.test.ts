import { describe, expect, it } from 'vitest';
import { formulaTags, holes, isBlankError, operatorGlyph, tagAt } from './formula-tags';

const brief = (src: string) => formulaTags(src).map((t) => `${t.kind}:${t.display}`);

describe('formulaTags', () => {
  it('draws a fresh function as a call with one placeholder tag per argument', () => {
    const src = 'mix({a}, {b}, {t})';
    expect(brief(src)).toEqual(['fn:mix', 'hole:a', 'comma:,', 'hole:b', 'comma:,', 'hole:t', 'close:)']);
    const [fn] = formulaTags(src);
    expect(fn).toMatchObject({ from: 0, to: 4, atomic: true, close: src.length - 1 });
    expect(holes(formulaTags(src)).map((h) => src.slice(h.from, h.to))).toEqual(['{a}', '{b}', '{t}']);
  });

  it('labels named rows and merges color and row references with their channels', () => {
    const src = 'row1 = mix(parent, white, 0.5)\nrow1.l - 10';
    const tags = formulaTags(src);
    expect(brief(src)).toEqual([
      'label:row1', 'fn:mix', 'color:parent', 'comma:,', 'color:white', 'comma:,', 'num:0.5', 'close:)',
      'row:row1', 'op:−', 'num:10',
    ]);
    expect(tags[0]).toMatchObject({ from: 0, to: 7, text: 'row1 = ' });
    expect(tags.find((t) => t.kind === 'row')).toMatchObject({ text: 'row1.l', base: 'row1', path: ['l'], atomic: true });
  });

  it('keeps @references, nested channel paths and math glyphs', () => {
    const tags = formulaTags('@Brand.hsl.l * 2 >= 10');
    expect(tags[0]).toMatchObject({ kind: 'color', base: '@Brand', path: ['hsl', 'l'], display: 'Brand', text: '@Brand.hsl.l' });
    expect(tags.filter((t) => t.kind === 'op').map((t) => t.display)).toEqual(['×', '≥']);
    expect(operatorGlyph('!=')).toBe('≠');
    expect(operatorGlyph('+')).toBe('+');
  });

  it('treats keywords, constants, comments and hex colors as tags too', () => {
    expect(brief('// note\nif dark then 80 else #3b82f6.l')).toEqual([
      'comment:// note', 'kw:if', 'const:dark', 'kw:then', 'num:80', 'kw:else', 'hex:#3b82f6', 'punct:.', 'prop:l',
    ]);
  });

  it('leaves unfinished input editable', () => {
    // A trailing dot is still being typed: the color tag stays, the dot is plain text.
    expect(brief('parent.')).toEqual(['color:parent', 'punct:.']);
    // A function name without its parenthesis is a word in progress, not an atomic tag.
    expect(formulaTags('mix')[0]).toMatchObject({ kind: 'name', atomic: false });
    expect(formulaTags('clamp(parent.l')[0]).toMatchObject({ kind: 'fn', close: undefined });
    expect(formulaTags('')).toEqual([]);
  });

  it('finds the tag at a position', () => {
    const tags = formulaTags('parent.l + 10');
    expect(tagAt(tags, 3)?.kind).toBe('color');
    expect(tagAt(tags, 8, -1)?.kind).toBe('color');
    expect(tagAt(tags, 8, 1)).toBeUndefined();
    expect(tagAt(tags, 11, 1)?.kind).toBe('num');
  });
});

describe('isBlankError', () => {
  it('recognizes unfilled placeholders only', () => {
    expect(isBlankError({ message: 'Fill in t — a number from 0 to 1' })).toBe(true);
    expect(isBlankError({ message: 'Unknown name "foo"' })).toBe(false);
    expect(isBlankError(undefined)).toBe(false);
  });
});
