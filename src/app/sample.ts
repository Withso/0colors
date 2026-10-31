// ─────────────────────────────────────────────────────────────
// The built-in sample canvas — the first thing every visitor sees.
// It doubles as the product tour: each section is introduced by a note
// and demonstrates one idea of color logic with live, editable nodes.
// ─────────────────────────────────────────────────────────────
import {
  createColorNode, createContrastNode, createMixNode, createNoteNode, createPaletteNode, createTokenNode,
  defaultThemes, makeEdge, valuesFromHex,
} from '@/engine/defaults';
import {
  type CanvasNode, type ColorNode, type Edge, type NoteNode, type PreviewSlot, type Project, type XY,
  shadeHandle, tokenHandle, uid,
} from '@/engine/model';
import type { ChannelValues } from '@/engine/color/spaces';

// Approximate rendered sizes, used only to lay the sections out without overlaps.
const COLOR = { w: 216, h: 170 };
const PALETTE = { w: 236, h: (steps: number) => 64 + steps * 24 };
const MIX = { w: 236, h: 200 };
const CONTRAST = { w: 256, h: 210 };
const TOKEN = { w: 236, h: (themes: number) => 52 + themes * 34 };

/** Rough rendered height of a note: ~7px per character, 20px per line, 40px padding. */
export function estimateNoteHeight(text: string, width: number): number {
  const perLine = Math.max(10, Math.floor((width - 28) / 7));
  const lines = text.split('\n').reduce((sum, line) => {
    const visible = line.replace(/\*\*|`/g, '');
    return sum + Math.max(1, Math.ceil(visible.length / perLine));
  }, 0);
  return 40 + lines * 20;
}

const TAILWIND_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
/** Output handle for a Tailwind-named step of an 11-step palette. */
const step = (name: number) => shadeHandle(TAILWIND_STEPS.indexOf(name));

const oklch = (l: number, c: number, h: number, alpha = 100): ChannelValues => ({ l, c, h, alpha });
const hsl = (h: number, s: number, l: number, alpha = 100): ChannelValues => ({ h, s, l, alpha });

const TEXT = {
  welcome: [
    '**Welcome to 0colors — a playground for color logic**',
    'Every color here is a node. Connected nodes derive their color from their parent through simple rules, so changing one color updates everything downstream.',
    '- Select any node — the inspector explains how its color is computed.',
    '- Double-click the canvas to add a color; drag from a node’s right edge to derive a new one.',
    '- Everything is saved in this browser. Use the menu to start a blank canvas or reset this sample.',
  ].join('\n'),
  spaces: [
    '**1 · Color spaces**',
    'Both rows use the same four hues. The HSL row shares one “lightness” (50%), yet yellow glows while blue looks dark.',
    'The OKLCH row shares L 70 — and really does look equally light.',
    '- Select a color and switch its space in the inspector to compare the numbers.',
  ].join('\n'),
  rules: [
    '**2 · Inheritance & rules**',
    'Children follow their parent channel by channel. Each channel has a rule:',
    '- **Inherit** — same as the parent',
    '- **Offset** — parent + an amount (Brand hover: L −6)',
    '- **Fixed** — its own value (Brand tint keeps C 0.05)',
    '- **Formula** — an expression (On brand flips L for contrast)',
    'Drag Brand’s hue and watch the whole family follow.',
  ].join('\n'),
  palettes: [
    '**3 · Palettes**',
    'A palette spreads one hue across a lightness scale. Brand scale takes its hue and chroma from Brand.',
    '- Compare HSL scale with Brand scale (OKLCH): OKLCH steps darken evenly, HSL steps jump.',
    '- Neutral is the gray ramp the tokens use.',
    '- Tones (HCT) is Material’s system: tone is perceived lightness, so a tone gap of 50+ means at least 4.5:1 contrast.',
  ].join('\n'),
  mixing: [
    '**4 · Mixing**',
    'Same two inputs, three color spaces, three different results:',
    '- **sRGB** averages raw numbers and goes muddy gray.',
    '- **OKLab** blends perceptually — the most even result.',
    '- **OKLCH** walks around the hue wheel and swings through green.',
    'Drag a Mix ratio, or change its space.',
  ].join('\n'),
  contrast: [
    '**5 · Contrast**',
    '**WCAG 2** gives a ratio: 4.5:1 is the minimum for body text, 3:1 for large text.',
    '**APCA** (proposed for WCAG 3) gives Lc: 75+ for body text, 60+ for large text. It depends on polarity — light text on dark scores differently than dark on light.',
  ].join('\n'),
  bodyText: [
    '**Body text check**',
    'Measures text/primary on bg/surface. Switch between Light and Dark at the top — both themes should pass.',
  ].join('\n'),
  tokens: [
    '**6 · Tokens & themes**',
    'Palettes and colors are **primitives**. Tokens give them a job: bg/surface, text/primary, action/primary…',
    '- Each token has one input per theme, so Light and Dark can pick different shades.',
    '- An unconnected theme falls back to Light — see status/*.',
    '- Tokens can alias tokens: button/bg → action/primary → Brand scale 600.',
    'Switch the theme at the top and watch the preview.',
  ].join('\n'),
  logic: [
    '**7 · Logic**',
    'These colors have no inputs — every channel is a formula.',
    '- `@brand` reads another node by name; dashed lines show those references.',
    '- `dark` is true in dark themes, so Adaptive accent gets lighter there.',
    '- `contrast(@brand, white) >= 4.5 ? 98 : 14` picks readable text automatically.',
    'Edit a formula in the inspector and watch the result update.',
  ].join('\n'),
};

export function createSampleProject(): Project {
  const now = Date.now();
  const themes = defaultThemes();
  const [light, dark] = themes;
  const nodes: CanvasNode[] = [];
  const edges: Edge[] = [];

  const add = <T extends CanvasNode>(node: T): T => {
    nodes.push(node);
    return node;
  };
  const connect = (source: CanvasNode, sourceHandle: string, target: CanvasNode, targetHandle: string) => {
    edges.push(makeEdge(source.id, sourceHandle, target.id, targetHandle));
  };
  const note = (position: XY, text: string, tone: NoteNode['data']['tone'], width: number) => {
    const n = add(createNoteNode({ position, text, tone, width }));
    return { node: n, bottom: position.y + estimateNoteHeight(text, width) };
  };
  const color = (name: string, position: XY, values: ChannelValues, rules: ColorNode['data']['rules'] = {}, space: ColorNode['data']['space'] = 'oklch') =>
    add(createColorNode({ name, position, space, values, rules }));

  // ── Row 1: welcome · color spaces · mixing ───────────────────
  const welcome = note({ x: 0, y: 0 }, TEXT.welcome, 'neutral', 420);

  const spacesX = 540;
  const spacesNote = note({ x: spacesX, y: 0 }, TEXT.spaces, 'blue', 360);
  const rowHsl = spacesNote.bottom + 60;
  const rowOk = rowHsl + COLOR.h + 60;
  const hues: [string, number, number][] = [
    // name, HSL hue, OKLCH hue
    ['yellow', 60, 100],
    ['green', 120, 145],
    ['blue', 230, 255],
    ['purple', 280, 305],
  ];
  hues.forEach(([hue, hslHue, okHue], i) => {
    const x = spacesX + i * (COLOR.w + 60);
    color(`HSL ${hue}`, { x, y: rowHsl }, hsl(hslHue, 90, 50), {}, 'hsl');
    color(`OKLCH ${hue}`, { x, y: rowOk }, oklch(70, 0.15, okHue));
  });
  const spacesBottom = rowOk + COLOR.h;

  const mixX = spacesX + 4 * (COLOR.w + 60) + 80;
  const mixNote = note({ x: mixX, y: 0 }, TEXT.mixing, 'pink', 360);
  const mixTop = mixNote.bottom + 60;
  const mixBlue = add(createColorNode({ name: 'Mix blue', position: { x: mixX, y: mixTop + 40 }, space: 'rgb', values: valuesFromHex('rgb', '#2563EB') }));
  const mixYellow = add(createColorNode({ name: 'Mix yellow', position: { x: mixX, y: mixTop + 40 + COLOR.h + 60 }, space: 'rgb', values: valuesFromHex('rgb', '#FACC15') }));
  const mixNodesX = mixX + COLOR.w + 120;
  (['srgb', 'oklab', 'oklch'] as const).forEach((space, i) => {
    const label = space === 'srgb' ? 'sRGB' : space === 'oklab' ? 'OKLab' : 'OKLCH';
    const mix = add(createMixNode({
      name: `Mix in ${label}`, position: { x: mixNodesX, y: mixTop + i * (MIX.h + 60) },
      space, ratio: 0.5, a: '#2563EB', b: '#FACC15',
    }));
    connect(mixBlue, 'out', mix, 'a');
    connect(mixYellow, 'out', mix, 'b');
  });
  const mixBottom = mixTop + 3 * MIX.h + 2 * 60;

  const row1Bottom = Math.max(welcome.bottom, spacesBottom, mixBottom);

  // ── Row 2 geometry ───────────────────────────────────────────
  // B is the top of the Brand node. Palettes and tokens start 300px higher so the
  // edge from Brand to Brand scale climbs over the comparison palette and the
  // contrast node instead of running behind them.
  const rulesNoteW = 360;
  const palettesNoteW = 380;
  const tokensNoteW = 380;
  const lift = 300;
  const B = row1Bottom + 140 + Math.max(
    estimateNoteHeight(TEXT.rules, rulesNoteW) + 60,
    lift + estimateNoteHeight(TEXT.palettes, palettesNoteW) + 60,
    lift + estimateNoteHeight(TEXT.tokens, tokensNoteW) + 60,
  );
  const P = B - lift;

  // ── Section 2: inheritance & rules ───────────────────────────
  note({ x: 0, y: B - estimateNoteHeight(TEXT.rules, rulesNoteW) - 60 }, TEXT.rules, 'yellow', rulesNoteW);
  const brandValues = oklch(55, 0.19, 262);
  const brand = color('Brand', { x: 0, y: B }, brandValues);
  const col1 = COLOR.w + 120;
  const col2 = col1 + COLOR.w + 60;
  const kidsTop = B + 200;
  const kid = (name: string, x: number, row: number, values: ChannelValues, rules: ColorNode['data']['rules']) => {
    const n = color(name, { x, y: kidsTop + row * (COLOR.h + 60) }, values, rules);
    connect(brand, 'out', n, 'in');
    return n;
  };
  kid('Brand hover', col1, 0, oklch(49, 0.19, 262), { l: { mode: 'offset', delta: -6 } });
  kid('Brand tint', col1, 1, oklch(87, 0.05, 262), { l: { mode: 'offset', delta: 32 }, c: { mode: 'fixed' } });
  kid('Brand muted', col1, 2, oklch(55, 0.076, 262), { c: { mode: 'formula', expr: 'parent.c * 0.4' } });
  kid('Brand complement', col2, 0, oklch(55, 0.19, 82), { h: { mode: 'offset', delta: 180 } });
  const onBrand = kid('On brand', col2, 1, oklch(98, 0.02, 262), {
    l: { mode: 'formula', expr: 'parent.l > 65 ? 18 : 98' },
    c: { mode: 'fixed' },
  });

  // ── Section 5: contrast (the button check lives beside Brand) ─
  const contrastX = col2 + COLOR.w + 100;
  const brandButton = add(createContrastNode({ name: 'Brand button', position: { x: contrastX, y: B }, sample: 'Get started' }));
  connect(onBrand, 'out', brandButton, 'fg');
  connect(brand, 'out', brandButton, 'bg');
  const contrastNote = note({ x: contrastX, y: B + CONTRAST.h + 60 }, TEXT.contrast, 'green', 300);

  // ── Section 7: logic (formulas only, references drawn dashed) ─
  const logicNote = note({ x: contrastX, y: contrastNote.bottom + 60 }, TEXT.logic, 'purple', 320);
  color('Adaptive accent', { x: contrastX, y: logicNote.bottom + 60 }, oklch(52, 0.171, 292), {
    l: { mode: 'formula', expr: 'dark ? 74 : 52' },
    c: { mode: 'formula', expr: '@brand.c * 0.9' },
    h: { mode: 'formula', expr: '@brand.h + 30' },
  });
  color('Readable on brand', { x: contrastX, y: logicNote.bottom + 60 + COLOR.h + 60 }, oklch(98, 0.02, 262), {
    l: { mode: 'formula', expr: 'contrast(@brand, white) >= 4.5 ? 98 : 14' },
    c: { mode: 'formula', expr: '0.02' },
    h: { mode: 'formula', expr: '@brand.h' },
  });

  // ── Section 3: palettes ──────────────────────────────────────
  const palX = contrastX + CONTRAST.w + 140;
  note({ x: palX, y: P - estimateNoteHeight(TEXT.palettes, palettesNoteW) - 60 }, TEXT.palettes, 'blue', palettesNoteW);
  const pal11 = PALETTE.h(11);
  add(createPaletteNode({
    name: 'HSL scale', position: { x: palX, y: P + 120 },
    space: 'hsl', hue: 262, chroma: 70, steps: 11, naming: 'tailwind', lightStart: 95, lightEnd: 20, curve: 'linear', chromaMode: 'constant',
  }));
  add(createPaletteNode({
    name: 'Tones (HCT)', position: { x: palX, y: P + 120 + pal11 + 80 },
    space: 'hct', hue: 262, chroma: 36, steps: 11, naming: 'tone', lightStart: 99, lightEnd: 10, curve: 'linear', chromaMode: 'constant',
  }));
  const scaleX = palX + PALETTE.w + 60;
  const brandScale = add(createPaletteNode({
    name: 'Brand scale', position: { x: scaleX, y: P },
    space: 'oklch', hue: 262, chroma: 0.19, steps: 11, naming: 'tailwind', lightStart: 97, lightEnd: 22, curve: 'linear', chromaMode: 'taper',
  }));
  connect(brand, 'out', brandScale, 'in');
  const neutral = add(createPaletteNode({
    name: 'Neutral', position: { x: scaleX, y: P + pal11 + 80 },
    space: 'oklch', hue: 262, chroma: 0.012, steps: 11, naming: 'tailwind', lightStart: 98, lightEnd: 14, curve: 'linear', chromaMode: 'constant',
  }));

  // ── Section 6: tokens & themes ───────────────────────────────
  const colA = scaleX + PALETTE.w + 160;
  const colB = colA + TOKEN.w + 140;
  const colC = colB + COLOR.w + 140;
  note({ x: colA, y: P - estimateNoteHeight(TEXT.tokens, tokensNoteW) - 60 }, TEXT.tokens, 'yellow', tokensNoteW);
  const tokenStep = TOKEN.h(themes.length) + 60;
  const token = (name: string, description: string, position: XY) => add(createTokenNode({ name, description, position }));
  const feed = (target: CanvasNode, lightSrc: [CanvasNode, string], darkSrc?: [CanvasNode, string]) => {
    connect(lightSrc[0], lightSrc[1], target, tokenHandle(light.id));
    if (darkSrc) connect(darkSrc[0], darkSrc[1], target, tokenHandle(dark.id));
  };

  const tokenSpecs: [string, string, number, number, CanvasNode][] = [
    // name, description, light step, dark step, palette
    ['bg/canvas', 'Page background', 100, 950, neutral],
    ['bg/surface', 'Cards, panels and inputs', 50, 900, neutral],
    ['border/default', 'Dividers and outlines', 200, 800, neutral],
    ['text/primary', 'Body text and headings', 900, 50, neutral],
    ['text/muted', 'Secondary text and captions', 600, 400, neutral],
    ['action/primary', 'Primary buttons and links', 600, 400, brandScale],
    ['action/on-primary', 'Text on primary buttons', 50, 950, neutral],
  ];
  const tokens: Record<string, CanvasNode> = {};
  tokenSpecs.forEach(([name, description, lightStep, darkStep, palette], i) => {
    const t = token(name, description, { x: colA, y: P + i * tokenStep });
    feed(t, [palette, step(lightStep)], [palette, step(darkStep)]);
    tokens[name] = t;
  });

  // Status colors are only wired for Light; Dark falls back to Light.
  const statusSpecs: [string, string, string, ChannelValues][] = [
    ['Success', 'status/success', 'Positive feedback', oklch(62, 0.17, 150)],
    ['Warning', 'status/warning', 'Caution and pending states', oklch(76, 0.16, 75)],
    ['Danger', 'status/danger', 'Errors and destructive actions', oklch(60, 0.21, 27)],
  ];
  statusSpecs.forEach(([colorName, tokenName, description, values], i) => {
    const y = P + i * (COLOR.h + 60);
    const c = color(colorName, { x: colB, y }, values);
    const t = token(tokenName, description, { x: colC, y: y + 25 });
    feed(t, [c, 'out']);
    tokens[tokenName] = t;
  });

  // An alias: a component token pointing at a semantic token.
  const actionRowY = P + 5 * tokenStep;
  const buttonBg = token('button/bg', 'Alias of action/primary for buttons', { x: colC, y: actionRowY });
  feed(buttonBg, [tokens['action/primary'], 'out']);
  tokens['button/bg'] = buttonBg;

  // The body text check sits under the status colors, right of the tokens it measures.
  const bodyTextY = P + 2 * (COLOR.h + 60) + COLOR.h + 70;
  const bodyText = add(createContrastNode({
    name: 'Body text', position: { x: colB, y: bodyTextY }, sample: 'The quick brown fox jumps over the lazy dog',
  }));
  connect(tokens['text/primary'], 'out', bodyText, 'fg');
  connect(tokens['bg/surface'], 'out', bodyText, 'bg');
  note({ x: colC, y: bodyTextY - 20 }, TEXT.bodyText, 'green', 280);

  const bindings: Partial<Record<PreviewSlot, string>> = {
    background: tokens['bg/canvas'].id,
    surface: tokens['bg/surface'].id,
    border: tokens['border/default'].id,
    text: tokens['text/primary'].id,
    'text-muted': tokens['text/muted'].id,
    primary: tokens['action/primary'].id,
    'on-primary': tokens['action/on-primary'].id,
    success: tokens['status/success'].id,
    warning: tokens['status/warning'].id,
    danger: tokens['status/danger'].id,
  };

  return {
    schema: 2,
    id: uid('p_'),
    name: '0colors sample',
    createdAt: now,
    updatedAt: now,
    themes,
    nodes,
    edges,
    preview: { bindings },
  };
}
