import { describe, expect, it } from 'vitest';
import { type CompletionContext, type TextEdit, addRowAfter, formulaCompletions, formulaDisplay, formulaRows, functionSnippet, highlightFormula, nextRowName, removeRow, renameLocal, signatureAt, slotSuggestions } from './formula-service';
import { type FormulaEnv, FORMULA_FUNCTIONS, evaluateFormula, parse } from './formula';
import { SPACE_ORDER, channelDefs, describe as describeColor, infoToSpace } from './color/spaces';

const ctx: CompletionContext = {
  space: 'oklch', channel: 'l', hasParent: true,
  nodes: [
    { slug: 'brand-blue', name: 'Brand Blue', type: 'color', hex: '#4488FF' },
    { slug: 'neutral-scale', name: 'Neutral scale', type: 'palette', hex: '#808080' },
    { slug: 'bg-surface', name: 'Background surface', type: 'token', hex: '#FFFFFF' },
  ],
};

/** Remove the single caret marker at `caret` (formulas may contain other '|' characters, e.g. `||`). */
const unmark = (marked: string, caret: number) => (caret < 0 ? marked : marked.slice(0, caret) + marked.slice(caret + 1));

function complete(marked: string, context = ctx) {
  const caret = marked.indexOf('|');
  return formulaCompletions(unmark(marked, caret), caret < 0 ? marked.length : caret, context);
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

  it('inserts calls with selected placeholders and avoids duplicating an existing parenthesis', () => {
    expect(complete('cl|')?.items[0]).toMatchObject({ label: 'clamp', insert: 'clamp({x}, {min}, {max})', select: { from: 6, to: 9 }, detail: 'clamp(x, min, max)' });
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
          const env: FormulaEnv = { space, channel: channel.key, parent: hasParent ? color : null, self: color, dark: false, ref: () => color };
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
  const signature = (marked: string) => signatureAt(unmark(marked, marked.indexOf('|')), marked.indexOf('|'));

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
  const alphabet = 'abc01_@#{}().,;=<>?!+-*/ \n\r×😄';
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
      formulaRows(source);
      nextRowName(source);
      addRowAfter(source, 0);
      removeRow(source, 0);
      renameLocal(source, 'a', 'b');
      slotSuggestions(source, i % (source.length + 1), i % (source.length + 1), ctx);
    }).not.toThrow();
  }
});

describe('formula placeholders and snippets', () => {
  it('highlights and displays each placeholder as one tag', () => {
    const source = 'mix({ a }, {b}, {t})';
    expect(highlightFormula(source).filter((s) => s.kind === 'placeholder').map((s) => source.slice(s.start, s.end))).toEqual(['{ a }', '{b}', '{t}']);
    expect(formulaDisplay(source)?.filter((t) => t.kind === 'placeholder')).toEqual([
      { kind: 'placeholder', text: 'a' }, { kind: 'placeholder', text: 'b' }, { kind: 'placeholder', text: 't' },
    ]);
    for (const source of ['{}', '{unfinished', `{${'a'.repeat(33)}}`]) expect(highlightFormula(source)[0].kind).toBe('error');
    expect(highlightFormula('{value}\n50').map((t) => t.kind)).toEqual(['placeholder', 'number']);
  });

  it('builds complete snippets and selects the first required argument', () => {
    expect(functionSnippet('mix')).toEqual({ text: 'mix({a}, {b}, {t})', select: { from: 4, to: 7 } });
    expect(functionSnippet('round')?.text).toBe('round({x})');
    expect(functionSnippet('min')?.text).toBe('min({a}, {b})');
    expect(functionSnippet('max')?.text).toBe('max({a}, {b})');
    expect(functionSnippet('MIX')).toEqual(functionSnippet('mix'));
    expect(functionSnippet('missing')).toBeNull();
    for (const fn of FORMULA_FUNCTIONS) {
      const snippet = functionSnippet(fn.name)!;
      expect(() => parse(snippet.text), fn.name).not.toThrow();
      expect(snippet.text.slice(snippet.select!.from, snippet.select!.to)).toMatch(/^\{\w+\}$/);
    }
    const conditional = complete('if|')!.items.find((i) => i.label === 'if … then … else')!;
    expect(conditional.insert).toBe('if {condition} then {value} else {value}');
    expect(conditional.insert.slice(conditional.select!.from, conditional.select!.to)).toBe('{condition}');
  });

  it('completes inside and at the start of a hole by replacing the whole tag', () => {
    const source = 'mix({a}, {b}, {t})';
    for (const offset of [0, 1, 2, 3]) {
      const start = source.indexOf('{b}');
      const result = formulaCompletions(source, start + offset, ctx)!;
      expect([result.from, result.to]).toEqual([start, start + 3]);
      expect(result.items.some((i) => i.insert === 'parent')).toBe(true);
      expect(result.items.some((i) => i.insert === '50')).toBe(false);
    }
    const amount = complete('mix({a}, {b}, {|t})')!;
    expect(amount.items.slice(0, 3).map((i) => i.insert)).toEqual(['0.25', '0.5', '0.75']);
  });
});

function slots(source: string, text: string, context = ctx, from = source.indexOf(text)) {
  return slotSuggestions(source, from, from + text.length, context);
}
const slotLabels = (source: string, text: string, context = ctx) => slots(source, text, context)?.items.map((i) => i.label) ?? [];

describe('slotSuggestions', () => {
  it('offers colors, earlier color locals and output nodes with known swatches', () => {
    const source = 'tint = #abc\nalias = @brand-blue\namount = 50\nmix({a}, white, 0.5)\nfuture = black';
    const context: CompletionContext = { ...ctx, nodes: [...ctx.nodes, { slug: 'note', name: 'Note', type: 'note' }, { slug: 'contrast', name: 'Contrast', type: 'contrast' }] };
    const items = slots(source, '{a}', context)!.items;
    expect(items.slice(0, 2).map((i) => i.insert)).toEqual(['parent', 'self']);
    expect(items.find((i) => i.insert === 'tint')).toMatchObject({ kind: 'local', detail: 'Color', hex: '#AABBCC' });
    expect(items.find((i) => i.insert === 'alias')).toMatchObject({ hex: '#4488FF' });
    expect(items.find((i) => i.insert === '@brand-blue')).toMatchObject({ kind: 'node', hex: '#4488FF' });
    expect(items.find((i) => i.insert === 'white')).toMatchObject({ hex: '#FFFFFF' });
    expect(items.some((i) => i.kind === 'value' && i.hex)).toBe(true);
    for (const text of ['amount', 'future', '@note', '@contrast', 'dark', '50']) expect(items.some((i) => i.insert === text)).toBe(false);
    expect(slotLabels('mix({a}, white, 0.5)', '{a}', { ...ctx, hasParent: false })).not.toContain('parent');
  });

  it('uses parameter examples, ranges, optional arguments and repeatable arguments', () => {
    const items = slots('amount = 0.5\nmix(parent, white, {t})', '{t}')!.items;
    expect(items.slice(0, 3).map((i) => [i.insert, i.kind, i.detail])).toEqual([
      ['0.25', 'value', '0–1'], ['0.5', 'value', '0–1'], ['0.75', 'value', '0–1'],
    ]);
    expect(items.map((i) => i.insert)).toContain('amount');
    expect(slotLabels('round(50, {step})', '{step}').slice(0, 3)).toEqual(['1', '5', '10']);
    expect(slotLabels('sin({degrees})', '{degrees}').slice(0, 3)).toEqual(['30', '90', '180']);
    expect(slotLabels('min(1, 2, 3, {more})', '{more}').slice(0, 3)).toEqual(['0', '50', '100']);
    expect(slotLabels('result = if(dark, {then}, {else})\n{value}', '{value}')).toContain('result');
  });

  it('keeps a scaled argument on its own scale and channel values on the channel’s', () => {
    // A 0–1 blend never offers a 0–100 channel reading.
    expect(slotLabels('mix(parent, white, {t})', '{t}')).not.toContain('parent.l');
    // Plain numbers (clamp's limits) follow the channel being edited, here OKLCH chroma.
    const chroma = { ...ctx, channel: 'c' };
    expect(slots('clamp(parent.c, {min}, {max})', '{min}', chroma)!.items.filter((i) => i.kind === 'value').map((i) => i.insert)).toEqual(['0', '0.05', '0.1', '0.2']);
    expect(slots('clamp(parent.c, {min}, {max})', '{min}', chroma)!.items.map((i) => i.insert)).toContain('parent.c');
  });

  it.each([
    ['oklch', 'l', ['0', '50', '100']], ['oklch', 'h', ['0', '90', '180', '270']],
    ['oklch', 'c', ['0', '0.05', '0.1', '0.2']], ['hct', 't', ['0', '50', '100']],
    ['rgb', 'g', ['0', '128', '255']], ['hsl', 'alpha', ['0', '50', '100']],
  ] as const)('uses appropriate literals for %s.%s', (space, channel, expected) => {
    const items = slots('{value}', '{value}', { ...ctx, space, channel })!.items;
    expect(items.filter((i) => i.kind === 'value').map((i) => i.insert)).toEqual(expected);
    expect(items.map((i) => i.insert)).toContain(`parent.${channel}`);
    expect(items.map((i) => i.insert)).toContain(`self.${channel}`);
  });

  it('keeps words apart when a tag is replaced', () => {
    const src = 'if dark&&light then 20 else 80';
    const res = slots(src, '&&')!;
    const or = res.items.find((i) => i.label === 'or')!;
    expect(src.slice(0, res.from) + or.insert + src.slice(res.to)).toBe('if dark or light then 20 else 80');
  });

  it.each([
    'if {condition} then 20 else 80', '{condition} ? 20 : 80', 'if({condition}, 20, 80)',
    'dark and {condition}', '{condition} or light', 'not {condition}', 'if ({condition}) then 20 else 80',
  ])('suggests conditions inside %s', (source) => {
    const labels = slotLabels(source, '{condition}');
    expect(labels).toEqual(['dark', 'light', 'parent.l > 50', 'contrast(parent, white) >= 4.5', 'true', 'false']);
  });

  it('uses valid self conditions when there is no parent, in every space', () => {
    const info = describeColor({ r: 0.3, g: 0.5, b: 0.7 });
    for (const space of SPACE_ORDER) {
      const items = slots('if {condition} then 20 else 80', '{condition}', { ...ctx, space, hasParent: false })!.items;
      const env: FormulaEnv = { space, parent: null, self: { info, label: 'self' }, dark: false, ref: () => ({ info, label: 'ref' }) };
      for (const item of items) {
        expect(item.insert).not.toContain('parent');
        expect(() => evaluateFormula(`if ${item.insert} then 20 else 80`, env)).not.toThrow();
      }
    }
  });

  it('distinguishes conditions, numeric operands, branches and named row expressions', () => {
    for (const source of ['if {value} > 50 then 20 else 80', 'if dark then {value} else 80', 'dark ? 20 : {value}', '{value} + 10', 'parent.l <= {value}', '{value}']) {
      const labels = slotLabels(source, '{value}');
      expect(labels).toContain('50');
      expect(labels).toContain('parent.l');
      expect(labels).not.toContain('dark');
      expect(labels).not.toContain('parent');
    }
    const any = slotLabels('row1 = {value}', '{value}');
    for (const text of ['50', 'parent', 'dark', 'mix']) expect(any).toContain(text);
    expect(slotLabels('contrast(parent, white) >= {ratio}', '{ratio}').slice(0, 3)).toEqual(['3', '4.5', '7']);
    expect(slotLabels('mix(black, white, {value} + 0.5)', '{value}').slice(0, 3)).toEqual(['0', '50', '100']);
  });

  it('recovers argument and condition slots before the formula is complete', () => {
    expect(slotSuggestions('mix(parent, white, ', 19, 19, ctx)?.items.slice(0, 3).map((i) => i.insert)).toEqual(['0.25', '0.5', '0.75']);
    expect(slotSuggestions('if ', 3, 3, ctx)?.items[0].insert).toBe('dark');
    expect(slotSuggestions('if dark then ', 13, 13, ctx)?.items[0].insert).toBe('0');
    expect(slotSuggestions('parent.', 7, 7, ctx)?.items.map((i) => i.insert)).toContain('l');
  });

  it('keeps punctuation and the next statement intact when filling empty caret slots', () => {
    for (const source of ['mix()', 'mix(, white, 0.5)']) {
      const result = slotSuggestions(source, 4, 4, ctx)!;
      expect([result.from, result.to]).toEqual([4, 4]);
      expect(result.items[0].insert).toBe('parent');
      expect(source.slice(0, result.from) + result.items[0].insert + source.slice(result.to)).toBe(source.replace('mix(', 'mix(parent'));
    }
    const condition = slotSuggestions('if then 20 else 80', 3, 3, ctx)!;
    expect([condition.from, condition.to]).toEqual([3, 3]);
    expect(condition.items[0].insert).toBe('dark ');
    expect(evaluateFormula(`if ${condition.items[0].insert}then 20 else 80`, rowEnv).value).toBe(80);
    expect(slotSuggestions('if', 2, 2, ctx)?.items[0].insert).toBe(' dark');
    const source = 'row1 = 20\n';
    const values = slotSuggestions(source, source.length, source.length, ctx)!.items.map((i) => i.insert);
    expect(values).toContain('row1');
    expect(values).toContain('parent.l');
    expect(values).not.toContain('parent');
    expect(values).not.toContain('dark');
  });

  it('suggests operator families with readable labels and executable insertions', () => {
    expect(slots('20 + 10', '+')?.items.map((i) => [i.label, i.insert, i.kind])).toEqual([
      ['−', '-', 'operator'], ['×', '*', 'operator'], ['÷', '/', 'operator'],
    ]);
    expect(slotLabels('20 × 10', '×')).toEqual(['+', '−', '÷']);
    expect(slotLabels('parent.l > 50', '>')).toEqual(['≥', '<', '≤', '=', '≠']);
    expect(slots('parent.l ≥ 50', '≥')?.items.find((i) => i.label === '=')?.insert).toBe('==');
    expect(slotLabels('dark and light', 'and')).toEqual(['or']);
    expect(slotLabels('dark || light', '||')).toEqual(['and']);
    expect(slotLabels('-20', '-')).toEqual(['+']);
    expect(slots('if dark then 20 else 80', 'then')).toBeNull();
  });

  it('suggests properties for the color or explicit namespace without duplicating dots', () => {
    expect(slotLabels('parent.l', 'l')).toEqual(['c', 'h', 'alpha', 'oklch', 'hct', 'hsl', 'rgb']);
    const source = 'parent.hsl.l';
    expect(slots(source, 'l', ctx, source.lastIndexOf('l'))?.items.map((i) => i.insert)).toEqual(['h', 's', 'alpha']);
    const spaces = slots(source, 'hsl')!.items.filter((i) => i.kind === 'space');
    expect(spaces.map((i) => i.insert)).toEqual(['oklch', 'hct', 'rgb']);
    expect(slots('(1).l', 'l')).toBeNull();
  });

  it('offers the same channel from other colors before other channels of the current color', () => {
    const source = 'row1 = white\nnumber = 50\nparent.l';
    const items = slots(source, 'parent.l')!.items;
    const labels = items.map((i) => i.insert);
    expect(labels[0]).toBe('self.l');
    for (const text of ['@brand-blue.l', 'row1.l', 'parent.c', 'parent.h', 'parent.alpha']) expect(labels).toContain(text);
    expect(labels.indexOf('@brand-blue.l')).toBeLessThan(labels.indexOf('parent.c'));
    expect(labels).not.toContain('number.l');
    expect(labels).not.toContain('parent.l');
    expect(slotLabels('parent.hsl.l', 'parent.hsl.l')).toContain('self.hsl.l');
    expect(slotLabels('parent.hsl.l', 'parent.hsl.l')).toContain('parent.hsl.s');
    expect(slotLabels('row1 = parent.hsl\nrow1.l', 'row1.l')).toContain('self.hsl.l');
  });

  it('normalizes partial tag selections, excludes the current insertion and gives useful item details', () => {
    const source = 'mix(parent, white, {t})';
    const from = source.indexOf('{t}');
    expect(slotSuggestions(source, from + 1, from + 2, ctx)).toMatchObject({ from, to: from + 3 });
    for (const [source, text] of [['50', '50'], ['mix(parent, white, 0.5)', 'parent'], ['parent.l', 'parent.l'], ['parent.hsl', 'hsl'], ['dark and light', 'and'], ['row1 = {value}', '{value}']]) {
      const items = slots(source, text)!.items;
      expect(items.some((i) => i.insert === text)).toBe(false);
      expect(new Set(items.map((i) => i.insert)).size).toBe(items.length);
      for (const item of items) {
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.detail!.length).toBeGreaterThan(0);
        expect(item.doc!.length).toBeGreaterThan(0);
      }
    }
    expect(slots('// {value}', '{value}')).toBeNull();
    expect(slotSuggestions('', NaN, 0, ctx)).toBeNull();
  });
});

function applyEdit(source: string, edit: TextEdit): string {
  for (let i = 0; i < edit.changes.length; i++) {
    const change = edit.changes[i];
    expect(change.from).toBeGreaterThanOrEqual(i ? edit.changes[i - 1].to : 0);
    expect(change.to).toBeGreaterThanOrEqual(change.from);
    expect(change.to).toBeLessThanOrEqual(source.length);
  }
  for (const change of [...edit.changes].reverse()) source = source.slice(0, change.from) + change.insert + source.slice(change.to);
  expect(edit.selection.anchor).toBeGreaterThanOrEqual(0);
  expect(edit.selection.anchor).toBeLessThanOrEqual(source.length);
  return source;
}

const rowInfo = describeColor({ r: 0.3, g: 0.5, b: 0.7 });
const rowEnv: FormulaEnv = { space: 'oklch', channel: 'l', parent: { info: rowInfo, label: 'parent' }, self: { info: rowInfo, label: 'self' }, dark: false, ref: () => ({ info: rowInfo, label: 'ref' }) };

describe('formula rows', () => {
  it.each(['', ' \r\n ', '// note\n// another', ';\n; // note'])('has no rows for %s', (source) => {
    expect(formulaRows(source)).toEqual([]);
    expect(addRowAfter(source, 0)).toEqual({ changes: [], selection: { anchor: 0 } });
  });

  it.each([
    '// color\nrow1 = mix(\nparent, white, 0.5\n)\nrow1.l',
    'row1 = 20; row2 = 30; row1 + row2',
    'row1 = 20\r\n// output\r\nrow1 +\r\n 10',
    'row1 = if dark\nthen 20\nelse 80\nrow1',
    'row1 = parent\n .hsl\n .l\nrow1',
    '{value}\n50',
  ])('matches parser statement spans in %s', (source) => {
    const ast = parse(source);
    const statements = ast.k === 'program' ? ast.statements : [{ s: ast.s, e: ast.e, name: null, expr: ast }];
    const rows = formulaRows(source);
    expect(rows.map((r) => [r.start, r.end, r.name])).toEqual(statements.map((s) => [s.s, s.e, s.name]));
    expect(rows.map((r) => r.exprStart)).toEqual(statements.map((s) => s.expr.s));
    expect(rows.map((r) => r.final)).toEqual(rows.map((_, i) => i === rows.length - 1));
  });

  it('keeps incomplete rows and comments out of statement spans', () => {
    const source = '// first\nrow1 = 20; // second\r\nrow2 = clamp(\r\nrow1,';
    const rows = formulaRows(source);
    expect(rows.map((r) => [r.name, source.slice(r.start, r.end)])).toEqual([
      ['row1', 'row1 = 20'], ['row2', 'row2 = clamp(\r\nrow1,'],
    ]);
    expect(formulaRows('row1 =   ')[0]).toMatchObject({ name: 'row1', exprStart: 9, end: 6, final: true });
    expect(formulaRows('row1 = {value}\n{unfinished').map((r) => r.name)).toEqual(['row1', null]);
  });

  it('chooses the next row name without collisions, even for large suffixes', () => {
    expect(nextRowName('')).toBe('row1');
    expect(nextRowName('row1 = 2; row9 = 4; row1')).toBe('row10');
    expect(nextRowName('row2 = {row99}\n@row100.l // row200\nparent.row300')).toBe('row3');
    expect(nextRowName('row9007199254740993 = 2')).toBe('row9007199254740994');
  });

  it.each([
    ['20', 0, 'row1 = 20\nrow1'],
    ['row4 = 20', 0, 'row4 = 20\nrow4'],
    ['row1 = 20\nrow1 + 10', 0, 'row1 = 20\nrow2 = row1\nrow1 + 10'],
    ['20\n50', 0, 'row1 = 20\nrow2 = row1\n50'],
    ['20; 50', 0, 'row1 = 20\nrow2 = row1; 50'],
    ['// first\n20 // keep\n// final\n50', 0, '// first\nrow1 = 20 // keep\nrow2 = row1\n// final\n50'],
    ['row1 = 20\r\nrow1 + 10', 1, 'row1 = 20\r\nrow2 = row1 + 10\r\nrow2'],
    ['mix(parent, white, 0.5)', 0, 'row1 = mix(parent, white, 0.5)\nrow1'],
  ])('adds after row %i of %s without changing the final value', (source, index, expected) => {
    const edit = addRowAfter(source, index);
    const result = applyEdit(source, edit);
    expect(result).toBe(expected);
    expect(evaluateFormula(result, rowEnv).value).toBeCloseTo(evaluateFormula(source, rowEnv).value, 10);
    const added = formulaRows(result)[index + 1];
    expect(edit.selection.anchor).toBe(added.end);
  });

  it.each([
    ['// first\n20 // inline\n// second\n50', 0, '// second\n50', 0],
    ['row1 = 20\nrow1', 1, '20', 2],
    ['row1 = 20; row1', 1, '20', 2],
    ['row1 = 20\r\n// final\r\nrow1', 1, '20', 2],
    ['row1 = 20 // keep\n// remove\nrow1', 1, '20 // keep', 2],
    ['row1 = // keep\n20\nrow1', 1, '// keep\n20', 10],
    ['row1 = 20; row2 = 30; 50', 1, 'row1 = 20; 50', 9],
    ['20\n// remove\n30\n// keep\n50', 1, '20\n// keep\n50', 2],
    ['// only\nrow1 = 20\n', 0, '', 0],
  ])('removes the selected row and its leading comments in %s', (source, index, expected, anchor) => {
    const edit = removeRow(source, index);
    expect(applyEdit(source, edit)).toBe(expected);
    expect(edit.selection.anchor).toBe(anchor);
    if (expected) expect(() => evaluateFormula(expected, rowEnv)).not.toThrow();
  });

  it('renames only declarations and later local uses, including multiline and unfinished rows', () => {
    const source = 'row1\n// row1\nrow1 = #fff; row2 = mix(row1, @row1, 0.5)\r\nrow1.l + parent.row1 + {row1} // row1\nrow1 +';
    expect(renameLocal(source, 'row1', 'base')).toBe('row1\n// row1\nbase = #fff; row2 = mix(base, @row1, 0.5)\r\nbase.l + parent.row1 + {row1} // row1\nbase +');
    const valid = 'row1 = 20\nrow2 = row1 + 10\nrow1 + row2';
    const renamed = renameLocal(valid, 'row1', 'base');
    expect(typeof renamed).toBe('string');
    expect(evaluateFormula(renamed as string, rowEnv).value).toBe(evaluateFormula(valid, rowEnv).value);
    expect(renameLocal(valid, 'row1', 'row1')).toBe(valid);
  });

  it.each(['', '1value', 'bad-name', 'two words', 'parent', 'IF', 'then', 'mix', 'true', 'row2'])('rejects invalid or colliding local name %s', (name) => {
    expect(renameLocal('row1 = 20\nrow2 = 30\nrow1 + row2', 'row1', name)).toEqual({ error: expect.any(String) });
  });

  it('handles absent locals and row indices without edits', () => {
    expect(renameLocal('20', 'missing', 'base')).toEqual({ error: expect.any(String) });
    expect(addRowAfter('20', 10).changes).toEqual([]);
    expect(removeRow('20', -1).changes).toEqual([]);
    expect(applyEdit('row1 = ;\n20', removeRow('row1 = ;\n20', 1))).toBe('');
  });
});
