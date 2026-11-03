import { describe, expect, it } from 'vitest';
import { parseColors } from './parse';
import { isInGamut, oklchToRgb, rgbToOklch, toHex } from './convert';

const hexes = (text: string) => parseColors(text).map((c) => toHex(c.rgb, c.alpha));

describe('parseColors', () => {
  it('reads every hex length in order and preserves exact source offsets', () => {
    const text = 'Colors: #abc, #abcd; #4F7DF3 and #4f7df380.';
    const result = parseColors(text);
    expect(result.map((c) => c.source)).toEqual(['#abc', '#abcd', '#4F7DF3', '#4f7df380']);
    expect(hexes(text)).toEqual(['#AABBCC', '#AABBCCDD', '#4F7DF3', '#4F7DF380']);
    for (const c of result) expect(text.slice(c.index, c.index + c.source.length)).toBe(c.source);
    expect(result[0].index).toBe(8);
  });

  it.each([
    ['rgb(255, 0, 128)', '#FF0080'],
    ['rgba(255,0,128,0.5)', '#FF008080'],
    ['rgb(255 0 128 / 50%)', '#FF008080'],
    ['rgba(100% 0% 50% / .25)', '#FF008040'],
    ['rgb(100%, 0%, 50%)', '#FF0080'],
    ['RGB(2.55e2\n0\t128 / 1e-1)', '#FF00801A'],
    ['rgb(100% 0 128)', '#FF0080'],
    ['rgb(255 /* red */ 0 128)', '#FF0080'],
    ['rgb(999 -20 128 / 200%)', '#FF0080'],
    ['rgba(255,0,0,-1)', '#FF000000'],
    ['rgb(none 0 128 / none)', '#00008000'],
    ['hsl(120, 100%, 50%)', '#00FF00'],
    ['hsla(120,100%,50%,.5)', '#00FF0080'],
    ['hsl(240 100% 50% / 75%)', '#0000FFBF'],
    ['hsl(-120deg 100% 50%)', '#0000FF'],
    ['hsl(.5turn 100% 50%)', '#00FFFF'],
    ['hsl(200grad 100% 50%)', '#00FFFF'],
    [`hsl(${Math.PI}rad 100% 50%)`, '#00FFFF'],
    ['hsl(720 100% 50%)', '#FF0000'],
    ['hsl(0 200% -10%)', '#000000'],
    ['hsl(none 100% 50% / none)', '#FF000000'],
    ['oklch(0 0 0)', '#000000'],
    ['oklch(100% 0 0 / .5)', '#FFFFFF80'],
    ['oklch(.5 0 0)', '#636363'],
    ['oklab(50% 0 0 / 25%)', '#63636340'],
    ['oklab(-1 0 0)', '#000000'],
    ['oklab(2 0 0)', '#FFFFFF'],
  ])('parses %s', (text, expected) => {
    expect(hexes(text)).toEqual([expected]);
  });

  it('uses CSS percentage scales for OKLab axes and OKLCH chroma', () => {
    expect(hexes('oklch(60% 50% 30)')).toEqual(hexes('oklch(.6 .2 30)'));
    expect(hexes('oklab(60% -25% 25%)')).toEqual(hexes('oklab(.6 -.1 .1)'));
    expect(hexes('oklch(60% .2 .5turn)')).toEqual(hexes('oklch(.6 .2 180)'));
    expect(hexes('oklch(50% -2 90)')).toEqual(hexes('oklch(.5 0 90)'));
  });

  it('maps out-of-gamut colors instead of clipping each channel', () => {
    expect(isInGamut(oklchToRgb({ l: 0.7, c: 0.4, h: 30 }))).toBe(false);
    const result = parseColors('oklch(70% .4 30) oklab(.7 .4 .4)');
    expect(result).toHaveLength(2);
    for (const c of result) {
      expect(isInGamut(c.rgb, 0)).toBe(true);
      expect(rgbToOklch(c.rgb).l).toBeCloseTo(0.7, 1);
    }
    expect(toHex(result[0].rgb)).not.toBe(toHex(oklchToRgb({ l: 0.7, c: 0.4, h: 30 })));
  });

  it('extracts CSS variable names, JSON keys and plain declaration labels', () => {
    const source = ':root {\n --brand-500: #4F7DF3; --accent: rgba(255, 0, 0, .5);\n}\n{"bg/surface": "#fff", "escaped\\u0020label": "hsl(0 0% 50%)"}\nforeground: #000';
    expect(parseColors(source).map((c) => c.name)).toEqual(['brand-500', 'accent', 'bg/surface', 'escaped label', 'foreground']);
    expect(parseColors('--multi-line:\n  oklch(.5 .1 240)')[0].name).toBe('multi-line');
    expect(parseColors("'accent': '#f00'")[0].name).toBe('accent');
  });

  it('does not invent a label for an unlabeled list or gradient', () => {
    expect(parseColors('#fff #000').map((c) => c.name)).toEqual([undefined, undefined]);
    expect(parseColors('background: linear-gradient(#fff, rgb(0 0 0))').map((c) => c.name)).toEqual([undefined, undefined]);
  });

  it.each([
    ['red', '#FF0000'], ['ReBeccAPurple', '#663399'], ['papayawhip', '#FFEFD5'], ['lightgoldenrodyellow', '#FAFAD2'],
    ['darkslategrey', '#2F4F4F'], ['grey', '#808080'], ['gray', '#808080'], ['aqua', '#00FFFF'], ['fuchsia', '#FF00FF'],
    ['green', '#008000'], ['lime', '#00FF00'], ['transparent', '#00000000'],
  ])('recognizes the CSS name %s only as the entire input', (name, expected) => {
    expect(hexes(`  ${name}\n`)).toEqual([expected]);
    expect(parseColors(`  ${name}\n`)[0]).toMatchObject({ source: name, index: 2, name: name.toLowerCase() });
    expect(parseColors(`Use ${name} here`)).toEqual([]);
  });

  it.each([
    '', 'constructor', '__proto__', 'currentColor', 'CanvasText', '#12', '#12345', '#1234567', '#123456789', '#ffffffz', '#fff_name', '#fff-name', '##fff',
    'myrgb(255, 0, 0)', 'custom-rgb(255, 0, 0)', 'abc#fff', 'rgb()', 'rgb(1 2)', 'rgb(1 2 3 4)', 'rgba(1,,3,.5)',
    'rgb(1,2,3 / .5)', 'rgb(1%, 2, 3)', 'rgb(1 2 3 /)', 'rgb(1 2 3 / .5 / .5)', 'rgb(Infinity 0 0)', 'rgb(1e999 0 0)',
    'rgb(0 0 0 / NaN)', 'rgb(0 0 0 / 1 2)', 'hsl(120%,100%,50%)', 'hsl(120,100,50)', 'hsl(1foo 100% 50%)',
    'oklch(50% .1)', 'oklch(.5, .1, 120)', 'oklab(50% .1 2deg)', 'oklab(.5 NaN 0)', 'oklab(.5 1e308 1e308)',
  ])('skips invalid or contextual color text %s', (text) => {
    expect(parseColors(text)).toEqual([]);
  });

  it('keeps other valid colors when a fragment is malformed and preserves duplicates', () => {
    expect(hexes('#12 #fff rgb(nope) #fff rgba(1,2,3) #123456789')).toEqual(['#FFFFFF', '#FFFFFF', '#010203']);
  });
});
