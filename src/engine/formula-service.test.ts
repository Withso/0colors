import { describe, expect, it } from 'vitest';
import { type CompletionContext, formulaCompletions, formulaDisplay, highlightFormula, signatureAt } from './formula-service';
import { type FormulaEnv, evaluateFormula } from './formula';
import { SPACE_ORDER, channelDefs, describe as describeColor, infoToSpace } from './color/spaces';

const ctx: CompletionContext = {
  space: 'oklch', channel: 'l', hasParent: true,
  nodes: [
    { slug: 'brand-blue', name: 'Brand Blue', type: 'color', hex: '#4488FF' },
    { slug: 'neutral-scale', name: 'Neutral scale', type: 'palette', hex: '#808080' },
    { slug: 'bg-surface', name: 'Background surface', type: 'token', hex: '#FFFFFF' },
  ],
};

function complete(marked: string, context = ctx) {
  const caret = marked.indexOf('|');
  return formulaCompletions(marked.replace('|', ''), caret < 0 ? marked.length : caret, context);
}

const labels = (marked: string, context = ctx) => complete(marked, context)?.items.map((i) => i.label) ?? [];
const display = (src: string) => formulaDisplay(src)?.map((t) => t.text).join('') ?? null;

describe('highlightFormula', () => {
  it('classifies colors, references, functions, namespaces, keywords and operators', () => {
    const source = 'IF parent.hsl.l ≥ 50 then clamp(@Brand.l × .5, 0, 100) else #ff0080.alpha // note';
    const spans = highlightFormula(source);
    const kinds = new Map(spans.map((s) => [source.slice(s.start, s.end), s.kind]));
    expect(kinds.get('IF')).toBe('keyword');
    expect(kinds.get('parent')).toBe('variable');
    expect(kinds.get('hsl')).toBe('property');
    expect(kinds.get('l')).toBe('property');
    expect(kinds.get('clamp')).toBe('function');
    expect(kinds.get('@Brand')).toBe('ref');
    expect(kinds.get('50')).toBe('number');
    expect(kinds.get('.5')).toBe('number');
    expect(kinds.get('≥')).toBe('operator');
    expect(kinds.get('(')).toBe('punctuation');
    expect(kinds.get('#ff0080')).toBe('hex');
    expect(kinds.get('// note')).toBe('comment');
  });

  it('recognizes local declarations and later uses, including semicolon statements', () => {
    const source = 'future\nout_1 = parent.l; out_2 = out_1 + 2\nout_2 + 1';
    const words = highlightFormula(source).map((s) => [source.slice(s.start, s.end), s.kind]);
    expect(words).toContainEqual(['future', 'name']);
    expect(words.filter(([word]) => word.startsWith('out_'))).toEqual([
      ['out_1', 'local'], ['out_2', 'local'], ['out_1', 'local'], ['out_2', 'local'],
    ]);
    expect(highlightFormula('out_1 = ').map((s) => s.kind)).toEqual(['local', 'operator']);
  });

  it('keeps malformed input highlighted without losing any non-whitespace characters', () => {
    for (const source of ['#12 + @ + 1..2', 'parent.. + "x"', 'if true then 😄', 'a = 1e-; // x', '\ttrue\r\nAND false\n']) {
      const spans = highlightFormula(source);
      for (let i = 0; i < spans.length; i++) {
        expect(spans[i].end).toBeGreaterThan(spans[i].start);
        if (i) expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
      }
      for (let i = 0; i < source.length; i++) {
        if (!/\s/.test(source[i])) expect(spans.filter((s) => s.start <= i && i < s.end)).toHaveLength(1);
      }
    }
    expect(highlightFormula('#12 1..2 $').every((s) => s.kind === 'error')).toBe(true);
    expect(highlightFormula('TRUE false mystery').map((s) => s.kind)).toEqual(['boolean', 'boolean', 'name']);
    expect(highlightFormula('1e-3 2E4').map((s) => s.kind)).toEqual(['number', 'number']);
  });
});

describe('formulaCompletions', () => {
  it('completes node slugs and names, keeps swatches and replaces the whole reference', () => {
    const result = complete('@br|and-blue + 2')!;
    expect([result.from, result.to]).toEqual([0, 11]);
    expect(result.items[0]).toMatchObject({ label: '@brand-blue', insert: '@brand-blue', kind: 'node', hex: '#4488FF' });
    expect(result.items[0].doc).toContain('Brand Blue');
    expect(labels('@background|')).toContain('@bg-surface');
    expect(labels('@ntl|')).toContain('@neutral-scale');
    expect(labels('@|')).toHaveLength(3);
  });

  it('ranks prefix before word starts, and word starts before fuzzy subsequences', () => {
    const nodes: CompletionContext['nodes'] = [
      { slug: 'brand', name: 'Brand', type: 'color' },
      { slug: 'blue-brand', name: 'Blue brand', type: 'color' },
      { slug: 'broad-random', name: 'Broad random', type: 'color' },
    ];
    expect(labels('@br|', { ...ctx, nodes })).toEqual(['@brand', '@broad-random', '@blue-brand']);
    expect(labels('@brand|', { ...ctx, nodes })).toEqual(['@brand', '@blue-brand', '@broad-random']);
  });

  it('excludes annotations and contrast checks even if the caller includes them', () => {
    const nodes: CompletionContext['nodes'] = [
      ...ctx.nodes,
      { slug: 'note', name: 'Note', type: 'note' },
      { slug: 'frame', name: 'Frame', type: 'section' },
      { slug: 'check', name: 'Check', type: 'contrast' },
    ];
    expect(labels('@|', { ...ctx, nodes })).toEqual(ctx.nodes.map((n) => `@${n.slug}`));
  });

  it('offers only the current space’s channels, alpha and space conversions', () => {
    expect(labels('parent.|')).toEqual(['l', 'c', 'h', 'alpha', 'oklch', 'hct', 'hsl', 'rgb']);
    expect(labels('parent.|', { ...ctx, space: 'rgb', channel: 'g' })).toEqual(['g', 'r', 'b', 'alpha', 'oklch', 'hct', 'hsl', 'rgb']);
    const result = complete('parent.l|ightness')!;
    expect([result.from, result.to]).toEqual([7, 16]);
    expect(result.items[0]).toMatchObject({ label: 'l', kind: 'property', detail: '0–100%' });
    expect(result.items[0].doc).toContain('lightness');
    expect(complete('parent.hsl|')?.items.find((i) => i.kind === 'space')).toMatchObject({ insert: 'hsl.' });
    expect(complete('parent.hs|l.l')?.items.find((i) => i.kind === 'space')).toMatchObject({ insert: 'hsl' });
  });

  it('understands explicit namespaces, parenthesized colors and calls', () => {
    expect(labels('parent.hsl.|')).toEqual(['l', 'h', 's', 'alpha']);
    expect(labels('@brand-blue.rgb.|')).toEqual(['r', 'g', 'b', 'alpha']);
    expect(labels('mix(parent, white, 0.5).|')).toContain('l');
    expect(labels('(if dark then black else white).|')).toContain('hsl');
    expect(labels('clamp(parent.l, 0, 100).|')).toEqual([]);
    expect(labels('(1).|')).toEqual([]);
    expect(labels('mystery.|')).toEqual([]);
  });

  it('infers local colors and namespaces without evaluating any formulas', () => {
    expect(labels('base = @brand-blue\nbase.|')).toContain('hsl');
    expect(labels('base = parent.hsl;\nbase.|')).toEqual(['l', 'h', 's', 'alpha']);
    expect(labels('base = 5\nbase.|')).toEqual([]);
    expect(labels('base = if dark then white else black\nbase.|')).toContain('l');
    expect(labels('base = mix(\nparent,\nwhite, 0.5\n)\nbase.|')).toContain('l');
  });

  it('offers earlier locals, including after semicolons, without future or unfinished declarations', () => {
    const source = 'out_1 = 2\nout_2 = out_1 * 2; ou|\nfuture = 3';
    expect(labels(source).slice(0, 2)).toEqual(['out_2', 'out_1']);
    expect(labels('first = 1; fi|')).toContain('first');
    expect(labels('unfinished = unf|')).not.toContain('unfinished');
    expect(labels('fu|\nfuture = 1')).not.toContain('future');
    expect(labels('// fake = 2\nfa|')).not.toContain('fake');
    expect(labels('out_1 = 2\n|')).toContain('out_1');
  });

  it('inserts calls with the caret inside and avoids duplicating an existing parenthesis', () => {
    expect(complete('cl|')?.items[0]).toMatchObject({ label: 'clamp', insert: 'clamp()', caret: 6, detail: 'clamp(x, min, max)' });
    expect(complete('CL|amp(1, 0, 10)')?.items[0]).toMatchObject({ label: 'clamp', insert: 'clamp', caret: 5 });
    expect(complete('clamp(|parent.l, 0, 100)')).toMatchObject({ from: 6, to: 12 });
    expect(complete('hu|', { ...ctx, channel: 'h' })?.items[0].label).toBe('huelerp');
    expect(complete('log|')?.items.map((i) => i.label)).toEqual(['log', 'log2', 'log10']);
  });

  it('offers parent only when available, while self and theme flags always work', () => {
    expect(labels('pa|')).toContain('parent');
    expect(labels('pa|', { ...ctx, hasParent: false })).not.toContain('parent');
    expect(labels('se|', { ...ctx, hasParent: false })).toContain('self');
    expect(labels('da|', { ...ctx, hasParent: false })).toContain('dark');
    expect(labels('li|')).toContain('light');
  });

  it('suggests conditional and logical keywords where they belong', () => {
    expect(labels('if dark th|')).toEqual(['then']);
    expect(labels('if parent.l > 50 |')).toEqual(['then']);
    expect(labels('if dark\n th|')).toEqual(['then']);
    expect(labels('if dark then 90 el|')).toEqual(['else']);
    expect(labels('if dark then if light then 90 else 10 |')).toEqual(['else']);
    expect(labels('dark |')).toEqual(['and', 'or']);
    expect(labels('if |')).toContain('dark');
    expect(labels('if dark then |')).toContain('self');
    expect(labels('parent.l + |')).toContain('clamp');
    expect(labels('if|')).toContain('if … then … else');
    expect(labels('if|')[0]).toBe('if … then … else');
  });

  it('ranks color inputs for color functions and includes reference swatches', () => {
    const result = complete('contrast(|')!;
    expect(result.items.slice(0, 4).map((i) => i.label)).toEqual(['parent', 'self', 'white', 'black']);
    expect(result.items.find((i) => i.label === '@brand-blue')?.hex).toBe('#4488FF');
    expect(complete('mix(white, black, |')?.items.some((i) => i.kind === 'node')).toBe(false);
  });

  it('returns null inside numbers, colors, comments, invalid tokens and nonmatching prefixes', () => {
    for (const source of ['1|2', '.5|', '1e-|3', '#ff|00ff', '#12|', '// pa|rent', '2 + $|', 'zzzzzzz|', '@missing|']) {
      expect(complete(source), source).toBeNull();
    }
    expect(complete('// comment\npa|')).not.toBeNull();
  });

  it('caps large lists at 40 and handles arbitrary caret positions', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({ slug: `color-${i}`, name: `Color ${i}`, type: 'color' as const }));
    expect(complete('@|', { ...ctx, nodes })?.items).toHaveLength(40);
    expect(formulaCompletions('', -100, ctx)?.from).toBe(0);
    expect(formulaCompletions('cl', 100, ctx)?.to).toBe(2);
    expect(formulaCompletions('', NaN, ctx)).toBeNull();
  });

  it('provides useful, executable empty-editor examples for every channel and parent state', () => {
    const info = describeColor({ r: 0.3, g: 0.5, b: 0.7 });
    for (const space of SPACE_ORDER) {
      for (const channel of channelDefs(space)) {
        for (const hasParent of [true, false]) {
          const context = { ...ctx, space, channel: channel.key, hasParent };
          const items = formulaCompletions('', 0, context)!.items.filter((i) => i.kind === 'example');
          expect(items.length).toBeGreaterThanOrEqual(3);
          const color = { info, native: { space, values: { ...infoToSpace(space, info), alpha: 100 } }, label: 'self' };
          const env: FormulaEnv = { space, parent: hasParent ? color : null, self: color, dark: false, ref: () => color };
          for (const item of items) {
            expect(item.doc!.length).toBeGreaterThan(10);
            if (!hasParent) expect(item.insert).not.toContain('parent');
            expect(Number.isFinite(evaluateFormula(item.insert, env).value), item.insert).toBe(true);
            expect(Number.isFinite(evaluateFormula(item.insert, { ...env, dark: true }).value), item.insert).toBe(true);
          }
        }
      }
    }
  });
});

describe('signatureAt', () => {
  const signature = (marked: string) => signatureAt(marked.replace('|', ''), marked.indexOf('|'));

  it('finds the innermost function and counts only its own commas', () => {
    expect(signature('clamp(1, |')).toMatchObject({ name: 'clamp', signature: 'clamp(x, min, max)', params: ['x', 'min', 'max'], active: 1 });
    expect(signature('clamp(lerp(1, |), 0, 100)')).toMatchObject({ name: 'lerp', active: 1 });
    expect(signature('clamp(lerp(1, 2, .5), |')).toMatchObject({ name: 'clamp', active: 1 });
    expect(signature('clamp((1 + 2), 0, |')).toMatchObject({ name: 'clamp', active: 2 });
    expect(signature('clamp((1 + |2), 0, 100)')).toMatchObject({ name: 'clamp', active: 0 });
  });

  it('handles legacy if, case, optional arguments, unknown functions and closed calls', () => {
    expect(signature('IF(true, 1, |')).toMatchObject({ name: 'if', active: 2 });
    expect(signature('round(1, |')).toMatchObject({ params: ['x', 'step?'], active: 1 });
    expect(signature('max(1, 2, 3, |')).toMatchObject({ active: 3 });
    expect(signature('clamp(unknown(|')).toBeNull();
    expect(signature('clamp(1, 0, 100)|')).toBeNull();
    expect(signature('if dark then |')).toBeNull();
    expect(signature('clamp(1, // , |')).toBeNull();
    expect(signature('clamp(1, // ,\n |')).toMatchObject({ active: 1 });
    expect(signatureAt('clamp(', NaN)).toBeNull();
  });
});

describe('formulaDisplay', () => {
  it.each([
    ['1 + 2 * 3', '1 + 2 × 3'],
    ['(1 + 2) * 3', '(1 + 2) × 3'],
    ['1 - (2 - 3)', '1 − (2 − 3)'],
    ['1 / (2 * 3)', '1 ÷ (2 × 3)'],
    ['(1 + 2) + 3', '1 + 2 + 3'],
    ['((parent.l))', 'parent.l'],
    ['!(dark && light)', 'not (dark and light)'],
    ['parent.l >= 50 && parent.c != 0', 'parent.l ≥ 50 and parent.c ≠ 0'],
    ['parent.l <= 50 || parent.c == 0', 'parent.l ≤ 50 or parent.c = 0'],
    ['dark ? 80 : 20', 'if dark then 80 else 20'],
    ['if(dark, 80, 20)', 'if dark then 80 else 20'],
    ['(dark ? 80 : 20) + 2', '(if dark then 80 else 20) + 2'],
    ['(if(dark, 80, 20)) * 2', '(if dark then 80 else 20) × 2'],
    ['dark ? 80 : light ? 20 : 40', 'if dark then 80 else if light then 20 else 40'],
    ['(dark ? white : black).hsl.l', '(if dark then white else black).hsl.l'],
    ['mix(white, black, .5).l', 'mix(white, black, 0.5).l'],
    ['a = 2; // note\nout_1 = a * 3\nout_1 - 1', 'a = 2\nout_1 = a × 3\nout_1 − 1'],
  ])('renders %s with meaningful parentheses', (source, expected) => {
    expect(display(source)).toBe(expected);
  });

  it('preserves reference metadata, properties, local styles and statement breaks', () => {
    const tokens = formulaDisplay('base = @Brand\nbase.hsl.l')!;
    expect(tokens.find((t) => t.kind === 'ref')).toEqual({ kind: 'ref', text: '@brand', ref: 'brand' });
    expect(tokens.filter((t) => t.kind === 'local').map((t) => t.text)).toEqual(['base', 'base']);
    expect(tokens.filter((t) => t.kind === 'property').map((t) => t.text)).toEqual(['hsl', 'l']);
    expect(tokens.filter((t) => t.kind === 'newline')).toEqual([{ kind: 'newline', text: '\n' }]);
  });

  it('returns null for incomplete or invalid syntax', () => {
    for (const source of ['', '// only comment', '1 +', 'if dark then 2', 'out_1 =', 'parent.', '@', '#12', '1 = 2']) {
      expect(formulaDisplay(source), source).toBeNull();
    }
  });

  it('preserves arithmetic evaluation order through nested output', () => {
    const info = describeColor({ r: 0.3, g: 0.5, b: 0.7 });
    const env: FormulaEnv = { space: 'oklch', parent: null, self: { info, label: 'self' }, dark: false, ref: () => ({ info, label: 'ref' }) };
    for (const source of ['1 - (2 - 3)', '1 / (2 / 3)', '1e16 + (-1e16 + 1)', '(if dark then 1 else 3) + 2', '2 * if dark then 3 else 4', 'max(1 + 2 * 3, (4 + 5) * 6)']) {
      expect(evaluateFormula(display(source)!, env).value, source).toBe(evaluateFormula(source, env).value);
    }
  });
});

it('all language services tolerate arbitrary unfinished input', () => {
  const alphabet = 'abc01_@#().,;=<>?!+-*/ \n\r×😄';
  let seed = 42;
  for (let i = 0; i < 200; i++) {
    let source = '';
    for (let j = 0; j < 32; j++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      source += alphabet[seed % alphabet.length];
    }
    expect(() => {
      highlightFormula(source);
      formulaCompletions(source, i % (source.length + 1), ctx);
      signatureAt(source, i % (source.length + 1));
      formulaDisplay(source);
    }).not.toThrow();
  }
});
