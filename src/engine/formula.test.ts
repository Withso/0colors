import { describe, expect, it } from 'vitest';
import {
  type ColorRef, type FormulaEnv, FORMULA_FUNCTIONS, FormulaError, collectRefs, evaluateFormula, parse,
  parseCached, tokenize,
} from './formula';
import { compositeOver, parseHex } from './color/convert';
import { type ChannelValues, type Space, describe as describeColor, infoToSpace } from './color/spaces';
import { apcaContrast, wcagContrast } from './color/contrast';

// ── helpers ──────────────────────────────────────────────────
function ref(hex: string, label = hex, native?: { space: Space; values: ChannelValues }): ColorRef {
  const p = parseHex(hex)!;
  return { info: describeColor(p.rgb, p.alpha), label, native };
}

function env(over: Partial<FormulaEnv> & { refs?: Record<string, ColorRef> } = {}): FormulaEnv {
  const refs = over.refs ?? {};
  return {
    space: over.space ?? 'oklch',
    parent: over.parent === undefined ? ref('#3B82F6', 'parent') : over.parent,
    self: over.self ?? ref('#FF5733', 'self'),
    dark: over.dark ?? false,
    ref: over.ref ?? ((name: string) => {
      const hit = refs[name];
      if (!hit) throw new FormulaError(`No node named @${name}`);
      return hit;
    }),
  };
}

const run = (src: string, e: FormulaEnv = env()) => evaluateFormula(src, e).value;

function expectError(src: string, pattern: RegExp, e: FormulaEnv = env()): FormulaError {
  let caught: unknown;
  try {
    evaluateFormula(src, e);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(FormulaError);
  expect((caught as Error).message).toMatch(pattern);
  return caught as FormulaError;
}

// A parent with exact OKLCH values (L 62.4) — `native` should win over conversion.
const nativeParent = ref('#3B82F6', 'parent', { space: 'oklch', values: { l: 62.4, c: 0.19, h: 255 } });

// ── lexer / parser ───────────────────────────────────────────
describe('tokenize', () => {
  it('produces typed tokens with spans', () => {
    const toks = tokenize('@Brand.l >= 50 && #fff');
    expect(toks.map((t) => t.t)).toEqual(['ref', 'op', 'id', 'op', 'num', 'op', 'hex', 'eof']);
    expect(toks[0]).toMatchObject({ v: 'Brand', s: 0, e: 6 });
    expect(toks[3]).toMatchObject({ v: '>=', s: 9, e: 11 });
    expect(tokenize('.5 + 1.25').map((t) => t.v)).toEqual(['.5', '+', '1.25', '']);
  });

  it('rejects bad characters, numbers and hex', () => {
    expect(() => tokenize('1 $ 2')).toThrow(FormulaError);
    expect(() => tokenize('1.2.3')).toThrow(/Malformed number/);
    expect(() => tokenize('#12')).toThrow(/not a valid hex/);
    expect(() => tokenize('@ + 1')).toThrow(/node name after @/);
  });
});

describe('parse', () => {
  it('lowercases refs and function names', () => {
    const ast = parse('@Brand.l + MAX(1, 2)');
    expect(ast.k).toBe('bin');
    expect(collectRefs(ast)).toEqual(new Set(['brand']));
    expect(run('MAX(1, 2)')).toBe(2);
  });

  it('collectRefs finds refs everywhere, including untaken branches', () => {
    const refs = collectRefs(parse('dark ? @a.l : max(@B.c, -@c.h, contrast(@d, white) > 3 ? 1 : 0)'));
    expect([...refs].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('parseCached returns the same AST object and rethrows parse errors', () => {
    const a = parseCached('parent.l * 2');
    const b = parseCached('parent.l * 2');
    expect(a).toBe(b);
    expect(() => parseCached('1 +')).toThrow(FormulaError);
    expect(() => parseCached('1 +')).toThrow(FormulaError);
  });
});

// ── arithmetic & logic ───────────────────────────────────────
describe('arithmetic and logic', () => {
  it('respects precedence and parentheses', () => {
    expect(run('1 + 2 * 3')).toBe(7);
    expect(run('(1 + 2) * 3')).toBe(9);
    expect(run('10 - 4 - 3')).toBe(3);
    expect(run('2 * 3 % 4')).toBe(2);
    expect(run('7 % 3')).toBe(1);
  });

  it('handles unary operators', () => {
    expect(run('-5 + 2')).toBe(-3);
    expect(run('--5')).toBe(5);
    expect(run('+3')).toBe(3);
    expect(run('-(2 * 3)')).toBe(-6);
    expect(run('!true ? 1 : 2')).toBe(2);
  });

  it('comparisons and ternaries', () => {
    expect(run('3 > 2 ? 10 : 20')).toBe(10);
    expect(run('3 < 2 ? 10 : 20')).toBe(20);
    expect(run('2 >= 2 ? 1 : 0')).toBe(1);
    expect(run('2 <= 1 ? 1 : 0')).toBe(0);
    expect(run('0.1 + 0.2 == 0.3 ? 1 : 0')).toBe(1);
    expect(run('1 != 1 ? 1 : 0')).toBe(0);
    expect(run('1 > 2 ? 1 : 2 > 1 ? 2 : 3')).toBe(2);
    expect(run('1 > 2 ? 1 : 2 > 3 ? 2 : 3')).toBe(3);
  });

  it('supports && || ! and the and/or/not keywords', () => {
    expect(run('1 < 2 && 2 < 3 ? 1 : 0')).toBe(1);
    expect(run('1 > 2 || 2 > 3 ? 1 : 0')).toBe(0);
    expect(run('1 < 2 and 3 < 2 ? 1 : 0')).toBe(0);
    expect(run('1 > 2 or 3 > 2 ? 1 : 0')).toBe(1);
    expect(run('not (1 > 2) ? 1 : 0')).toBe(1);
    expect(run('true ? 4 : 5')).toBe(4);
    expect(run('false ? 4 : 5')).toBe(5);
  });

  it('treats booleans as 0/1 in arithmetic', () => {
    expect(run('(2 > 1) + 1')).toBe(2);
    expect(run('dark * 10', env({ dark: true }))).toBe(10);
  });
});

// ── functions ────────────────────────────────────────────────
describe('functions', () => {
  it('math helpers', () => {
    expect(run('clamp(15, 0, 10)')).toBe(10);
    expect(run('clamp(-5, 0, 10)')).toBe(0);
    expect(run('min(3, 1, 2)')).toBe(1);
    expect(run('max(3, 1, 2)')).toBe(3);
    expect(run('lerp(10, 20, 0.25)')).toBe(12.5);
    expect(run('map(5, 0, 10, 100, 200)')).toBe(150);
    expect(run('map(5, 1, 1, 7, 9)')).toBe(7);
    expect(run('round(2.5)')).toBe(3);
    expect(run('round(23, 5)')).toBe(25);
    expect(run('round(0.1234, 0.01)')).toBeCloseTo(0.12, 9);
    expect(run('floor(2.7)')).toBe(2);
    expect(run('ceil(2.1)')).toBe(3);
    expect(run('abs(-4)')).toBe(4);
    expect(run('pow(2, 10)')).toBe(1024);
    expect(run('sqrt(16)')).toBe(4);
    expect(run('sqrt(-4)')).toBe(0);
    expect(run('mod(-30, 360)')).toBe(330);
    expect(run('mod(370, 360)')).toBe(10);
    expect(run('mod(5, 0)')).toBe(0);
    expect(run('step(50, 49)')).toBe(0);
    expect(run('step(50, 50)')).toBe(1);
    expect(run('smoothstep(0, 10, 5)')).toBe(0.5);
    expect(run('smoothstep(0, 10, -1)')).toBe(0);
    expect(run('smoothstep(0, 10, 20)')).toBe(1);
    expect(run('sin(90)')).toBeCloseTo(1, 9);
    expect(run('cos(180)')).toBeCloseTo(-1, 9);
    expect(run('if(1 > 2, 10, 20)')).toBe(20);
    expect(run('if(true, 10, 1 / 0)')).toBe(10); // lazy: untaken branch is never evaluated
    expect(run('pi')).toBeCloseTo(Math.PI, 12);
  });

  it('color helpers', () => {
    const blue = parseHex('#3B82F6')!.rgb;
    expect(run('contrast(black, white)')).toBeCloseTo(21, 6);
    expect(run('contrast(parent, white)')).toBeCloseTo(wcagContrast(blue, { r: 1, g: 1, b: 1 }), 9);
    expect(run('apca(black, white)')).toBeCloseTo(106.04, 1);
    expect(run('apca(parent, black)')).toBeCloseTo(apcaContrast(blue, { r: 0, g: 0, b: 0 }), 9);
    expect(run('luminance(white)')).toBeCloseTo(1, 9);
    expect(run('luminance(black)')).toBe(0);
    expect(run('deltaE(parent, parent)')).toBe(0);
    expect(run('deltae(black, white)')).toBeCloseTo(100, 0);
    const mid = run('mix(white, black, 0.5).l');
    expect(mid).toBeGreaterThan(45);
    expect(mid).toBeLessThan(55);
    expect(run('mix(white, black, 0).l')).toBeCloseTo(100, 1);
    expect(run('mix(white, black, 5).l')).toBeCloseTo(0, 1); // t is clamped to 0..1
  });

  it('every documented function evaluates', () => {
    const samples: Record<string, string> = {
      clamp: 'clamp(1, 0, 2)', min: 'min(1, 2)', max: 'max(1, 2)', lerp: 'lerp(0, 1, 0.5)',
      map: 'map(1, 0, 2, 0, 10)', round: 'round(1.4)', floor: 'floor(1.4)', ceil: 'ceil(1.4)',
      abs: 'abs(-1)', pow: 'pow(2, 2)', sqrt: 'sqrt(4)', mod: 'mod(5, 3)', step: 'step(1, 2)',
      smoothstep: 'smoothstep(0, 1, 0.5)', sin: 'sin(30)', cos: 'cos(60)', if: 'if(true, 1, 2)',
      contrast: 'contrast(white, black)', apca: 'apca(black, white)', luminance: 'luminance(white)',
      deltae: 'deltaE(white, black)', mix: 'mix(white, black, 0.5).l',
      sign: 'sign(-2)', tan: 'tan(45)', atan2: 'atan2(1, 1)', log: 'log(1)', log2: 'log2(8)',
      log10: 'log10(100)', exp: 'exp(1)', fract: 'fract(1.5)', invlerp: 'invlerp(0, 10, 5)',
      inverselerp: 'inverselerp(0, 10, 5)', huelerp: 'huelerp(350, 10, 0.5)',
    };
    for (const fn of FORMULA_FUNCTIONS) {
      expect(samples[fn.name], `missing sample for ${fn.name}`).toBeDefined();
      expect(Number.isFinite(run(samples[fn.name]))).toBe(true);
    }
  });
});

describe('formula language v2', () => {
  it('composites translucent text for contrast just like the contrast node', () => {
    expect(run('contrast(#0000, white)')).toBe(1);
    expect(run('apca(#0000, white)')).toBe(0);
    const seen = compositeOver({ r: 0, g: 0, b: 0 }, 128 / 255, { r: 1, g: 1, b: 1 });
    expect(run('contrast(#00000080, white)')).toBeCloseTo(wcagContrast(seen, { r: 1, g: 1, b: 1 }), 9);
  });

  it('points reference failures at the evaluated occurrence', () => {
    const source = '// @missing\nif false then @missing.l else @missing.l';
    const error = expectError(source, /No node named @missing/);
    expect(error.start).toBe(source.lastIndexOf('@missing'));
    expect(source.slice(error.start, error.end)).toBe('@missing');
  });

  it.each([
    ['if true then 10 else 20', 10],
    ['IF FALSE THEN 10 ELSE 20', 20],
    ['if (1 < 2) then 3 else 4', 3],
    ['if (1 < 2) and true then 3 else 4', 3],
    ['if (1 + 2) > 0 then 3 else 4', 3],
    ['if 1 > 2 then 1 else if 2 > 1 then 2 else 3', 2],
    ['if true then if false then 1 else 2 else 3', 2],
    ['if false then 1 else if false then 2 else 3', 3],
    ['(if true then 2 else 3) * 4', 8],
    ['if true then 2 else 3 + 4', 2],
    ['if(1 < 2, 3, 4)', 3],
    ['IF(true, if false then 1 else 2, 3)', 2],
    ['max(if true then 2 else 3, 4)', 4],
    ['if NOT false AND true OR false then 4 else 5', 4],
    ['if true then 1 else 1 / 0', 1],
    ['false and (1 / 0) ? 1 : 2', 2],
    ['if\n true\n then\n 1\n else\n 2', 1],
    ['if (true)\nthen 1\nelse 2', 1],
  ])('evaluates %s', (source, expected) => {
    expect(run(source)).toBe(expected);
  });

  it('evaluates named rows in order, with numbers, booleans and colors', () => {
    const source = '// A reusable color\nbase = mix(black, white, 0.5)\nout_1 = base.oklch.l\nis_dark = out_1 < 60\nif is_dark then out_1 + 10 else out_1';
    const result = evaluateFormula(source, env());
    expect(result.value).toBeCloseTo(60, 3);
    expect(result.steps.map((s) => s.name)).toEqual(['base', 'out_1', 'is_dark', null]);
    expect(result.steps.map((s) => s.value)).toEqual(['#636363', '50', 'true', '60']);
    for (const step of result.steps) expect(source.slice(step.start, step.end)).toBe(step.text);
    expect(result.lookups).toContainEqual({ text: 'out_1', value: '50' });
  });

  it('supports semicolons, blank lines, CRLF and a final assignment', () => {
    expect(run(';\r\nout_1 = 5;\r\n\r\nout_2 = out_1 * 2;')).toBe(10);
    expect(run('a = 4; a = a + 2; a')).toBe(6);
    expect(run('1\n2\n3')).toBe(3);
  });

  it('keeps multiline arithmetic, member access and arguments working', () => {
    expect(run('1 +\n 2 *\n 3')).toBe(7);
    expect(run('1\n + 2\n * 3')).toBe(7);
    expect(run('white\n .hsl\n .l')).toBeCloseTo(100);
    expect(run('max(\n 1,\n 2\n)')).toBe(2);
    expect(run('max\n(1, 2)')).toBe(2);
    expect(run('value =\n (1 +\n 2); value')).toBe(3);
    expect(run('true\n ? 1\n : 2')).toBe(1);
  });

  it('ignores comments while preserving exact source offsets', () => {
    const source = '// intro\r\nout_1 = 2 // first\r\n\n out_1 × 3 // final';
    const result = evaluateFormula(source, env());
    expect(result.value).toBe(6);
    expect(result.steps).toEqual([
      { name: 'out_1', text: 'out_1 = 2', value: '2', start: 10, end: 19 },
      { name: null, text: 'out_1 × 3', value: '6', start: 32, end: 41 },
    ]);
    expect(run('1 + // continue\n 2')).toBe(3);
    expectError('// only a comment', /Write a formula/);
  });

  it('includes a step for an existing single expression', () => {
    expect(evaluateFormula('  2 + 3  ', env()).steps).toEqual([
      { name: null, text: '2 + 3', value: '5', start: 2, end: 7 },
    ]);
  });

  it('isolates locals between evaluations and treats identifiers as plain data', () => {
    expect(run('constructor = 2; __proto__ = 3; constructor + __proto__')).toBe(5);
    expect(run('amount = 2; amount')).toBe(2);
    expectError('amount', /Unknown name/);
    expectError('parent.constructor', /not a OKLCH channel/);
    expectError('parent.hsl.__proto__', /not a HSL channel/);
  });

  it('reports forward references and self-references at the offending name', () => {
    const err = expectError('out_1 + 1\nout_1 = 2', /Local "out_1" is used before it is defined/);
    expect([err.start, err.end]).toEqual([0, 5]);
    expectError('out_1 = out_1 + 1', /before it is defined/);
    expect(run('if true then 2 else out_1\nout_1 = 3')).toBe(3);
  });

  it.each(['parent', 'self', 'dark', 'light', 'white', 'black', 'pi', 'clamp', 'IF', 'then', 'TRUE'])('protects %s from assignment', (name) => {
    expectError(`${name} = 2; 3`, /reserved/);
  });

  it.each(['parent.l = 2', '1 = 2', 'if dark = true then 1 else 0', 'a = (2 = 2)', 'clamp(2 = 3, 0, 1)'])('explains comparison = in %s', (source) => {
    const err = expectError(source, /Use == to compare/);
    expect(source.slice(err.start, err.end)).toBe('=');
  });

  it('suggests variables, functions and earlier locals, including transposed letters', () => {
    expectError('parnt.l', /Unknown name "parnt" — did you mean parent\?/);
    expectError('clmap(1, 0, 2)', /did you mean clamp/);
    expectError('out_1 = 2; ou_1', /did you mean out_1/);
    expectError('brand.l', /did you mean @brand/);
  });

  it('collects references across every statement and conditional branch', () => {
    const refs = collectRefs(parse('a = @Brand;\nb = if dark then @night else @day\nmax(a.l, b.l) + @other.l'));
    expect([...refs]).toEqual(['brand', 'night', 'day', 'other']);
  });

  it.each([
    ['2 × 3 · 4 ÷ 2 − 1', 11],
    ['if 3 ≤ 3 and 4 ≥ 2 and 3 ≠ 4 then 1 else 0', 1],
    ['1e2 + 5E-1 + .25e+1', 103],
    ['sign(-3) + sign(0) + sign(2)', 0],
    ['tan(45)', 1],
    ['atan2(1, 0)', 90],
    ['atan2(-1, 0)', 270],
    ['atan2(0, -1)', 180],
    ['atan2(0, 0)', 0],
    ['log(exp(2))', 2],
    ['log2(8)', 3],
    ['log10(100)', 2],
    ['fract(2.25)', 0.25],
    ['fract(-2.25)', 0.75],
    ['invlerp(10, 20, 15)', 0.5],
    ['inverselerp(20, 10, 15)', 0.5],
    ['invlerp(1, 1, 10)', 0],
    ['invlerp(0, 10, 20)', 2],
    ['huelerp(350, 10, 0.5)', 0],
    ['huelerp(10, 350, 0.5)', 0],
    ['huelerp(-10, 370, 0.25)', 355],
    ['huelerp(0, 180, 0.5)', 90],
    ['huelerp(350, 10, 2)', 30],
  ])('supports %s', (source, expected) => {
    expect(run(source)).toBeCloseTo(expected, 8);
  });

  it('validates new functions and rejects invalid intermediate statements', () => {
    expectError('atan2(1)', /takes 2 arguments/);
    expectError('log(0)', /positive value/);
    expectError('log2(-1)', /positive value/);
    expectError('log10(-1)', /positive value/);
    expectError('x = exp(1000); 2', /invalid number/);
    expectError('exp(1000)', /invalid number/);
    expectError('1e', /digits after the exponent/);
  });

  it('provides consistent function metadata for autocomplete and signature help', () => {
    for (const fn of FORMULA_FUNCTIONS) {
      expect(fn.signature.slice(fn.signature.indexOf('('))).toBe(`(${fn.params.join(', ')})`);
      expect(['math', 'logic', 'color']).toContain(fn.category);
      expect(fn.description.length).toBeGreaterThan(5);
    }
  });

  it('exposes alpha through explicit space namespaces as well as shorthand', () => {
    expect(run('#ff000080.hsl.alpha')).toBeCloseTo(128 / 255 * 100);
    expect(run('#ff000080.rgb.a')).toBeCloseTo(128 / 255 * 100);
  });

  it('reports incomplete conditionals and statements as formula errors', () => {
    expectError('if dark 1 else 2', /Expected "then"/);
    expectError('if dark then 1', /Expected "else"/);
    expectError('if dark then 1 else', /ends too early/);
    expectError('out_1 =', /ends too early/);
    expectError('out_1 = 2; out_2 =', /ends too early/);
    expectError('then 2', /Unexpected/);
    expectError('if()', /takes 3 arguments/);
    expectError('if(true)', /takes 3 arguments/);
  });
});

// ── variables & member access ────────────────────────────────
describe('variables and channels', () => {
  it('shorthand channels follow env.space', () => {
    const oklch = describeColor(parseHex('#3B82F6')!.rgb).oklch;
    expect(run('parent.l')).toBeCloseTo(oklch.l * 100, 9);
    expect(run('parent.c')).toBeCloseTo(oklch.c, 9);
    expect(run('parent.h')).toBeCloseTo(oklch.h, 9);
    const hsl = describeColor(parseHex('#3B82F6')!.rgb).hsl;
    expect(run('parent.l', env({ space: 'hsl' }))).toBeCloseTo(hsl.l, 9);
    expect(run('parent.s', env({ space: 'hsl' }))).toBeCloseTo(hsl.s, 9);
    expect(run('parent.r', env({ space: 'rgb' }))).toBeCloseTo(59, 6);
    expect(run('parent.t', env({ space: 'hct' }))).toBeGreaterThan(50);
  });

  it('explicit namespaces work from any space', () => {
    const info = describeColor(parseHex('#3B82F6')!.rgb);
    expect(run('parent.hsl.l')).toBeCloseTo(info.hsl.l, 9);
    expect(run('parent.hct.t')).toBeCloseTo(info.hct.t, 9);
    expect(run('parent.rgb.r')).toBeCloseTo(59, 6);
    expect(run('parent.oklch.l', env({ space: 'hsl' }))).toBeCloseTo(info.oklch.l * 100, 9);
    expect(run('white.hsl.l')).toBeCloseTo(100, 6);
  });

  it('prefers native values when the space matches', () => {
    const e = env({ parent: nativeParent });
    expect(run('parent.l', e)).toBe(62.4);
    expect(run('parent.oklch.h', e)).toBe(255);
    // A different space converts from the resolved color instead.
    const hslL = infoToSpace('hsl', nativeParent.info).l;
    expect(run('parent.hsl.l', e)).toBeCloseTo(hslL, 9);
    expect(run('parent.l', env({ parent: nativeParent, space: 'hsl' }))).toBeCloseTo(hslL, 9);
  });

  it('alpha and a are 0..100', () => {
    expect(run('parent.alpha')).toBe(100);
    expect(run('#ff000080.a')).toBeCloseTo((128 / 255) * 100, 6);
  });

  it('self, refs, hex literals and theme flags', () => {
    expect(run('self.rgb.r')).toBeCloseTo(255, 6);
    const refs = { brand: ref('#000000', '@brand') };
    expect(run('@Brand.l', env({ refs }))).toBeCloseTo(0, 6);
    expect(run('@brand.l + 10', env({ refs }))).toBeCloseTo(10, 6);
    expect(run('#ffffff.l')).toBeCloseTo(100, 3);
    expect(run('dark ? 80 : 20', env({ dark: true }))).toBe(80);
    expect(run('dark ? 80 : 20', env({ dark: false }))).toBe(20);
    expect(run('light ? 1 : 0', env({ dark: false }))).toBe(1);
  });
});

// ── errors ───────────────────────────────────────────────────
describe('errors', () => {
  it('empty formula', () => {
    expectError('   ', /Write a formula/);
  });

  it('unknown identifier suggests @name', () => {
    const err = expectError('brand.l', /did you mean @brand/);
    expect([err.start, err.end]).toEqual([0, 5]);
  });

  it('unknown function and wrong arity', () => {
    expectError('wobble(1)', /Unknown function "wobble\(\)"/);
    const err = expectError('clamp(1, 2)', /clamp\(x, min, max\) takes 3 arguments/);
    expect(err.start).toBe(0);
    expect(err.end).toBe(11);
    expectError('min()', /takes/);
    expectError('abs(1, 2)', /takes 1 argument$/);
  });

  it('unknown channels', () => {
    expectError('parent.s', /"s" is not a OKLCH channel/);
    expectError('parent.hsl.c', /"c" is not a HSL channel/);
    expectError('(1).l', /Numbers have no "\.l"/);
  });

  it('missing parent', () => {
    const err = expectError('parent.l', /no parent/, env({ parent: null }));
    expect([err.start, err.end]).toEqual([0, 6]);
  });

  it('non-numeric results', () => {
    expectError('1 > 2', /true\/false/);
    expectError('parent', /gives a color/);
    expectError('parent.hsl', /channel group/);
    expectError('parent + 1', /Expected a number but got a color/);
    expectError('contrast(1, white)', /Expected a color here/);
  });

  it('division by zero points at the divisor', () => {
    const err = expectError('10 / (2 - 2)', /Division by zero/);
    expect(err.start).toBe(5);
  });

  it('syntax problems', () => {
    expectError('1 2', /Unexpected "2"/);
    expectError('(1 + 2', /Missing "\)"/);
    expectError('1 +', /ends too early/);
    expectError('1 ? 2', /Missing ":"/);
    expectError('#12345', /not a valid hex/);
    expectError('parent.', /property name after/);
    expectError('* 2', /Unexpected "\*"/);
  });

  it('ref resolution errors propagate', () => {
    expectError('@ghost.l', /No node named @ghost/);
  });
});

// ── explanations ─────────────────────────────────────────────
describe('substituted output and lookups', () => {
  it('splices looked-up values into the source', () => {
    const r = evaluateFormula('parent.l > 60 ? 15 : 98', env({ parent: nativeParent }));
    expect(r.value).toBe(15);
    expect(r.substituted).toBe('62.4 > 60 ? 15 : 98');
    expect(r.lookups).toEqual([{ text: 'parent.l', value: '62.4' }]);
  });

  it('records color functions as single values and keeps the outermost span', () => {
    const r = evaluateFormula('max(contrast(black, white), parent.c * 10)', env({ parent: nativeParent }));
    expect(r.value).toBeCloseTo(21, 6);
    expect(r.substituted).toBe('max(21, 0.19 * 10)');
    expect(r.lookups.map((l) => l.text)).toEqual(['contrast(black, white)', 'parent.c']);
  });

  it('shows theme flags and only the evaluated branch', () => {
    const r = evaluateFormula('dark ? parent.l : 10', env({ dark: false, parent: nativeParent }));
    expect(r.value).toBe(10);
    expect(r.substituted).toBe('false ? parent.l : 10');
  });

  it('rounds long decimals', () => {
    const r = evaluateFormula('parent.l / 3', env({ parent: ref('#000', 'p', { space: 'oklch', values: { l: 10, c: 0, h: 0 } }) }));
    expect(r.value).toBeCloseTo(3.3333, 3);
    expect(r.substituted).toBe('10 / 3');
  });
});
