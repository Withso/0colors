// The permanent, editable demo doubles as the product tour. Each numbered frame
// contains a small live experiment; reference material lives on the canvas too.
import {
  createColorNode, createContrastNode, createHtmlNode, createMixNode, createNoteNode, createPaletteNode, createSectionNode,
  createTokenNode, defaultThemes, makeEdge, valuesFromHex,
} from '@/engine/defaults';
import {
  type CanvasNode, type ColorNode, type Edge, type NoteTone, type PreviewSlot, type Project, type SectionNode,
  type XY, shadeHandle, tokenHandle,
} from '@/engine/model';
import type { ChannelValues } from '@/engine/color/spaces';

export const SAMPLE_ID = 'sample';
export const isSampleId = (id: string) => id === SAMPLE_ID;

/** Conservative footprint for NoteText: padding, word wrapping and paragraph gaps. */
export function estimateNoteHeight(text: string, width: number): number {
  const perLine = Math.max(10, Math.floor((width - 40) / 7));
  const paragraphs = text.split('\n');
  const lines = paragraphs.reduce((sum, paragraph) => {
    const visible = paragraph.replace(/\*\*|`/g, '');
    let count = 1;
    let used = 0;
    for (const word of visible.split(/\s+/).filter(Boolean)) {
      if (used && used + 1 + word.length > perLine) { count++; used = 0; }
      const length = word.length + (used ? 1 : 0);
      count += Math.floor(Math.max(0, length - 1) / perLine);
      used += length % perLine || perLine;
    }
    return sum + count;
  }, 0);
  return 40 + lines * 20 + Math.max(0, paragraphs.length - 1) * 6;
}

const FRAME_WIDTH = 1200;
const FRAME_GAP = 160;
const ROW_TOPS = [0, 1320, 2440, 3960];
const TAILWIND_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const step = (name: number) => shadeHandle(TAILWIND_STEPS.indexOf(name));
const oklch = (l: number, c: number, h: number, alpha = 100): ChannelValues => ({ l, c, h, alpha });
const hsl = (h: number, s: number, l: number, alpha = 100): ChannelValues => ({ h, s, l, alpha });

// Kept here, not in the inspector: each term is a small, independently readable note.
const GLOSSARY = [
  ['Hue', 'A position on the color wheel: red, yellow, green, blue. Measured in degrees; 0° and 360° meet.'],
  ['Chroma vs saturation', 'Chroma measures colorfulness. HSL saturation is relative to the most vivid color at that lightness. Two colors at 100% saturation can look very different.'],
  ['Lightness vs tone', 'Both describe how light a color looks. HSL lightness is geometric; OKLCH lightness and HCT tone aim to match perception.'],
  ['OKLCH', 'A perceptual color space: lightness, chroma, hue. Useful for predictable edits and palettes. Modern CSS accepts oklch(L C H).'],
  ['HCT', 'Hue, Chroma, Tone: the space used by Material Design 3. Tone follows CIE L*, which helps make contrast predictable.'],
  ['HSL', 'Hue, Saturation, Lightness: an easy-to-read reshaping of RGB. Equal lightness numbers do not look equally light across hues.'],
  ['sRGB gamut', 'The colors a standard sRGB display can represent. Very vivid colors can fall outside this range; gamut mapping brings them back into it.'],
  ['Relative luminance', 'A measure of light weighted for human vision: green contributes more than blue. WCAG contrast uses relative luminance, not HSL lightness.'],
  ['WCAG contrast', 'A ratio from 1:1 to 21:1. WCAG 2 AA needs 4.5:1 for normal text and 3:1 for large text. AAA normal text needs 7:1.'],
  ['APCA', 'A perceptual contrast model with a signed Lc score. Polarity, font size and weight matter. Use it alongside the WCAG 2 check.'],
  ['Primitive token', 'A named raw color, such as brand-500 or neutral-50. Primitives are the ingredients that semantic tokens point to.'],
  ['Semantic token', 'A color named for its job: bg/surface or text/primary. Each theme can point that job to a different primitive.'],
  ['Alias', 'A token that points to another token. button/bg → action/primary means both follow the same decision.'],
] as const;

export function createSampleProject(): Project {
  const now = Date.now();
  const themes = defaultThemes();
  const [light, dark] = themes;
  const nodes: CanvasNode[] = [];
  const edges: Edge[] = [];
  const add = <T extends CanvasNode>(node: T): T => { nodes.push(node); return node; };
  const connect = (source: CanvasNode, sourceHandle: string, target: CanvasNode, targetHandle: string) => {
    edges.push(makeEdge(source.id, sourceHandle, target.id, targetHandle));
  };
  const frame = (name: string, index: number, tone: NoteTone, height = 960) => add(createSectionNode({
    name, tone, width: FRAME_WIDTH, height,
    position: { x: (index % 3) * (FRAME_WIDTH + FRAME_GAP), y: ROW_TOPS[Math.floor(index / 3)] },
  }));
  const at = (section: SectionNode, x: number, y: number): XY => ({ x: section.position.x + x, y: section.position.y + y });
  const note = (section: SectionNode, x: number, y: number, width: number, text: string, tone = section.data.tone) => {
    const node = createNoteNode({ position: at(section, x, y), width, text, tone });
    node.name = text.split('\n')[0].replace(/\*\*|`/g, '');
    return add(node);
  };
  const color = (section: SectionNode, name: string, x: number, y: number, values: ChannelValues, rules: ColorNode['data']['rules'] = {}, space: ColorNode['data']['space'] = 'oklch') =>
    add(createColorNode({ name, position: at(section, x, y), values, rules, space }));
  const tutorial = (section: SectionNode, doc: string, name: string, height: number) =>
    add(createHtmlNode({ doc, name, position: at(section, 40, 84), width: 1120, height }));

  // 0 · Landing page + a real experiment. Native CTA buttons live inside the HTML footprint.
  const start = frame('Start here', 0, 'neutral');
  tutorial(start, 'welcome', 'Welcome to 0colors', 512);
  const play = color(start, 'Play color', 224, 644, oklch(62, 0.17, 262));
  const playTint = color(start, 'Play tint', 544, 644, oklch(80, 0.08, 262), {
    l: { mode: 'offset', delta: 18 }, c: { mode: 'fixed' },
  });
  connect(play, 'out', playTint, 'in');
  note(start, 832, 644, 328, [
    '**Now it’s your turn**',
    'Select Play color. Drag the picker under its swatch to change lightness and chroma together.',
    'Play tint follows with lightness +18 and chroma fixed at 0.08.',
    'Reset demo brings the tour back.',
  ].join('\n'));

  // 1 · Two rows with identical numeric lightness, but different visual behavior.
  const spaces = frame('1 · Color spaces', 1, 'blue');
  tutorial(spaces, 'spaces', 'Same lightness. Different light.', 300);
  const hues: [string, number, number][] = [['yellow', 60, 100], ['green', 120, 145], ['blue', 230, 255], ['purple', 280, 305]];
  hues.forEach(([name, hslHue, okHue], i) => {
    const x = 40 + i * 288;
    color(spaces, `HSL ${name}`, x, 440, hsl(hslHue, 90, 50), {}, 'hsl');
    color(spaces, `OKLCH ${name}`, x, 680, oklch(70, 0.13, okHue));
  });

  // 2 · All four channel rule modes, including a formula on a connected child.
  const rules = frame('2 · Inheritance & rules', 2, 'yellow', 1160);
  tutorial(rules, 'derive', 'One decision. A whole family.', 300);
  const brand = color(rules, 'Brand', 40, 460, oklch(55, 0.19, 262));
  const child = (name: string, x: number, y: number, values: ChannelValues, channelRules: ColorNode['data']['rules']) => {
    const node = color(rules, name, x, y, values, channelRules);
    connect(brand, 'out', node, 'in');
    return node;
  };
  child('Brand hover', 424, 460, oklch(49, 0.19, 262), { l: { mode: 'offset', delta: -6 } });
  child('Brand tint', 424, 680, oklch(87, 0.05, 262), { l: { mode: 'offset', delta: 32 }, c: { mode: 'fixed' } });
  child('Brand muted', 424, 900, oklch(55, 0.076, 262), { c: { mode: 'formula', expr: 'parent.c * 0.4' } });
  child('Brand complement', 848, 460, oklch(55, 0.1, 82), { c: { mode: 'fixed' }, h: { mode: 'offset', delta: 180 } });
  child('On brand', 848, 680, oklch(98, 0, 262), {
    l: { mode: 'formula', expr: 'if contrast(parent, white) >= 4.5 then 98 else 14' }, c: { mode: 'fixed' },
  });
  note(rules, 40, 760, 288, '**Try the rules**\nHover lowers L by 6. Tint fixes C at 0.05. Muted multiplies the parent’s chroma.\nSelect any child to see its rule.');
  note(rules, 816, 900, 344, '**A formula can choose**\nOn brand checks contrast with white, then picks a light or dark text color. Frame 5 shows how to check a pair.');

  // 3 · Matching-size palettes make the effect of space and chroma easy to compare.
  const palettes = frame('3 · Palettes', 3, 'blue');
  note(palettes, 40, 84, 1120, [
    '**One hue, a useful scale.**',
    'Brand scale follows Palette seed. Compare the spacing in OKLCH, HSL and HCT. Neutral shows a gentler gray ramp.',
    'Select a palette. Try its step count, curve or chroma taper; drag a shade’s dot to use that exact step.',
  ].join('\n'));
  const paletteSeed = color(palettes, 'Palette seed', 40, 300, oklch(55, 0.19, 262));
  const brandScale = add(createPaletteNode({
    name: 'Brand scale', position: at(palettes, 336, 280),
    space: 'oklch', hue: 262, chroma: 0.19, steps: 11, naming: 'tailwind', lightStart: 97, lightEnd: 22, curve: 'linear', chromaMode: 'taper',
  }));
  connect(paletteSeed, 'out', brandScale, 'in');
  add(createPaletteNode({
    name: 'Neutral', position: at(palettes, 632, 280),
    space: 'oklch', hue: 262, chroma: 0.018, steps: 11, naming: 'tailwind', lightStart: 98, lightEnd: 16, curve: 'linear', chromaMode: 'taper',
  }));
  add(createPaletteNode({
    name: 'HSL scale', position: at(palettes, 928, 280),
    space: 'hsl', hue: 262, chroma: 70, steps: 11, naming: 'tailwind', lightStart: 95, lightEnd: 20, curve: 'linear', chromaMode: 'constant',
  }));
  add(createPaletteNode({
    name: 'Tones (HCT)', position: at(palettes, 336, 620),
    space: 'hct', hue: 262, chroma: 36, steps: 11, naming: 'tone', lightStart: 99, lightEnd: 10, curve: 'linear', chromaMode: 'constant',
  }));
  note(palettes, 40, 620, 240, '**Read the triangles**\nChroma taper softens each end. A triangle marks a step outside sRGB; its swatch is mapped into range.\nLower chroma to compare.');
  note(palettes, 632, 700, 528, '**Numbers are names, too**\nTailwind labels run from 50 to 950. A palette’s main output is its base; each shade has its own output dot.');

  // 4 · The same pair, the same ratio, three mixing spaces.
  const mixing = frame('4 · Mixing', 4, 'pink');
  note(mixing, 40, 84, 1120, [
    '**Same inputs. Three different paths.**',
    'These mixes use equal parts blue and yellow. The space determines the colors in between.',
    'Select a mix and drag its ratio from 0 to 100%. Both connected inputs stay editable.',
  ].join('\n'));
  const mixBlue = color(mixing, 'Mix blue', 40, 300, valuesFromHex('rgb', '#2563EB'), {}, 'rgb');
  const mixYellow = color(mixing, 'Mix yellow', 40, 560, valuesFromHex('rgb', '#FACC15'), {}, 'rgb');
  (['srgb', 'oklab', 'oklch'] as const).forEach((space, i) => {
    const label = space === 'srgb' ? 'sRGB' : space === 'oklab' ? 'OKLab' : 'OKLCH';
    const mix = add(createMixNode({ name: `Mix in ${label}`, position: at(mixing, 432, 252 + i * 228), space, ratio: 0.5, a: '#2563EB', b: '#FACC15' }));
    connect(mixBlue, 'out', mix, 'a');
    connect(mixYellow, 'out', mix, 'b');
  });
  note(mixing, 800, 280, 360, '**sRGB**\nAverages screen channels. The midpoint can look muted.');
  note(mixing, 800, 508, 360, '**OKLab**\nBlends along a perceptual path. A useful starting point for smooth transitions.');
  note(mixing, 800, 736, 360, '**OKLCH**\nMoves around the hue wheel. This vivid midpoint falls outside sRGB, so the swatch is mapped into range.');

  // 5 · Self-contained pairs, including a theme-aware reading surface.
  const contrast = frame('5 · Contrast', 5, 'green');
  note(contrast, 40, 84, 1120, [
    '**Check the pair people will actually read.**',
    'The left pair makes a button. The right pair makes a reading surface, with formulas that adapt to the theme.',
    'Switch Light / Dark in the top bar. Body text stays readable in both themes.',
  ].join('\n'));
  const buttonFill = color(contrast, 'Button fill', 40, 280, oklch(55, 0.19, 262));
  const buttonInk = color(contrast, 'Button ink', 40, 520, oklch(98, 0, 262), {
    l: { mode: 'formula', expr: 'if contrast(parent, white) >= 4.5 then 98 else 14' }, c: { mode: 'fixed' },
  });
  connect(buttonFill, 'out', buttonInk, 'in');
  const brandButton = add(createContrastNode({ name: 'Brand button', position: at(contrast, 400, 300), sample: 'Get started' }));
  connect(buttonInk, 'out', brandButton, 'fg');
  connect(buttonFill, 'out', brandButton, 'bg');
  const surface = color(contrast, 'Reading surface', 400, 580, oklch(98, 0, 262), { l: { mode: 'formula', expr: 'if dark then 16 else 98' } });
  const ink = color(contrast, 'Reading ink', 816, 580, oklch(16, 0, 262), { l: { mode: 'formula', expr: 'if dark then 98 else 16' } });
  const bodyText = add(createContrastNode({ name: 'Body text', position: at(contrast, 816, 300), sample: 'A little clarity goes a long way' }));
  connect(ink, 'out', bodyText, 'fg');
  connect(surface, 'out', bodyText, 'bg');
  note(contrast, 40, 800, 536, '**WCAG 2**\nAA: 4.5:1 for normal text; 3:1 for large text (18 pt, or 14 pt bold). AAA normal text: 7:1. Try changing Button fill.');
  note(contrast, 624, 800, 536, '**APCA**\nLc includes polarity. The target depends on font size and weight. Use the labels as guidance alongside WCAG 2.');

  // 6 · Semantic roles, theme-specific inputs, fallback and an alias chain.
  const tokensFrame = frame('6 · Tokens & themes', 6, 'yellow', 1360);
  tutorial(tokensFrame, 'themes', 'Name the job. Let the theme choose.', 224);
  const token = (name: string, description: string, x: number, y: number) =>
    add(createTokenNode({ name, description, position: at(tokensFrame, x, y) }));
  const feed = (target: CanvasNode, lightSrc: [CanvasNode, string], darkSrc?: [CanvasNode, string]) => {
    connect(lightSrc[0], lightSrc[1], target, tokenHandle(light.id));
    if (darkSrc) connect(darkSrc[0], darkSrc[1], target, tokenHandle(dark.id));
  };
  const themeBrand = add(createPaletteNode({
    name: 'Theme brand', position: at(tokensFrame, 40, 360),
    space: 'oklch', hue: 262, chroma: 0.19, steps: 11, naming: 'tailwind', lightStart: 97, lightEnd: 22, chromaMode: 'taper',
  }));
  const themeNeutral = add(createPaletteNode({
    name: 'Theme neutral', position: at(tokensFrame, 336, 360),
    space: 'oklch', hue: 262, chroma: 0.018, steps: 11, naming: 'tailwind', lightStart: 98, lightEnd: 16, chromaMode: 'taper',
  }));
  const tokenSpecs: [string, string, number, number, CanvasNode, number, number][] = [
    ['bg/canvas', 'Page background', 100, 950, themeNeutral, 40, 800],
    ['bg/surface', 'Cards, panels and inputs', 50, 900, themeNeutral, 336, 800],
    ['border/default', 'Dividers and outlines', 200, 800, themeNeutral, 632, 800],
    ['text/primary', 'Body text and headings', 900, 50, themeNeutral, 928, 800],
    ['text/muted', 'Secondary text and captions', 600, 400, themeNeutral, 40, 1000],
    ['action/primary', 'Primary buttons and links', 600, 400, themeBrand, 336, 1000],
    ['action/on-primary', 'Text on primary buttons', 50, 950, themeNeutral, 632, 1000],
  ];
  const tokens: Record<string, CanvasNode> = {};
  for (const [name, description, lightStep, darkStep, palette, x, y] of tokenSpecs) {
    const t = token(name, description, x, y);
    feed(t, [palette, step(lightStep)], [palette, step(darkStep)]);
    tokens[name] = t;
  }
  const statuses: [string, string, string, ChannelValues][] = [
    ['Success', 'status/success', 'Positive feedback', oklch(62, 0.17, 150)],
    ['Warning', 'status/warning', 'Caution and pending states', oklch(76, 0.16, 75)],
    ['Danger', 'status/danger', 'Errors and destructive actions', oklch(60, 0.21, 27)],
  ];
  const statusPositions = [[632, 360, 928, 1000], [928, 360, 40, 1200], [632, 580, 336, 1200]];
  statuses.forEach(([name, tokenName, description, values], i) => {
    const [x, y, tx, ty] = statusPositions[i];
    const source = color(tokensFrame, name, x, y, values);
    const t = token(tokenName, description, tx, ty);
    feed(t, [source, 'out']);
    tokens[tokenName] = t;
  });
  const buttonBg = token('button/bg', 'Alias of action/primary for buttons', 632, 1200);
  feed(buttonBg, [tokens['action/primary'], 'out']);
  tokens['button/bg'] = buttonBg;
  note(tokensFrame, 928, 580, 228, '**Try both themes**\nSwitch Light / Dark. Open Preview.\nEmpty Dark inputs use Light. Palette triangles mark sRGB mapping.');
  note(tokensFrame, 928, 1200, 228, '**Trace a token**\nSelect button/bg to follow its chain.');

  // 7 · Readable syntax, local color/number/boolean values, comments and @dependencies.
  const logic = frame('7 · Logic', 7, 'purple', 1360);
  tutorial(logic, 'logic', 'Color with a point of view.', 300);
  color(logic, 'Logic brand', 40, 460, oklch(55, 0.19, 262));
  color(logic, 'Adaptive accent', 400, 460, oklch(52, 0.171, 292), {
    l: { mode: 'formula', expr: '// More light on dark surfaces\nbase = @logic-brand\nif dark then max(base.l, 74) else 52' },
    c: { mode: 'formula', expr: '@logic-brand.c × (if dark then 0.55 else 0.9)' },
    h: { mode: 'formula', expr: '@logic-brand.h + 30' },
  });
  note(logic, 696, 440, 464, [
    '**Choose with if / then / else**',
    '`if dark then max(base.l, 74) else 52`',
    'Adaptive accent is lighter in Dark. base is a local color from @logic-brand; .l reads its lightness.',
    'Switch themes and watch it change.',
  ].join('\n'));
  color(logic, 'Readable on brand', 400, 720, oklch(98, 0, 262), {
    l: { mode: 'formula', expr: '// Pick text from a contrast check\nbase = @logic-brand\nratio = contrast(base, white)\nreadable = ratio >= 4.5\nif readable then 98 else 14' },
    c: { mode: 'formula', expr: '0' },
    h: { mode: 'formula', expr: '@logic-brand.h' },
  });
  note(logic, 696, 700, 464, [
    '**Name the steps**',
    '`base = @logic-brand` stores a color. ratio stores a number; readable stores a yes/no result.',
    '`=` defines a local; `==` compares values. Locals belong to this channel only.',
    'Each row shows its value on the right and the last row is the output. Enter adds a row; `//` starts a comment.',
  ].join('\n'));
  color(logic, 'Hue journey', 400, 1000, oklch(60, 0.12, 307), {
    l: { mode: 'formula', expr: 'if dark then 80 else 60' },
    c: { mode: 'formula', expr: 'min(@logic-brand.c, 0.12)' },
    h: { mode: 'formula', expr: '// A quarter-turn toward the complement\nstart = @logic-brand.h\nend = start + 180\nhuelerp(start, end, 0.25)' },
  });
  note(logic, 696, 980, 464, [
    '**Every piece is a tag**',
    'Hue journey uses huelerp to travel partway around the color wheel. Click any tag to swap it for something that fits there.',
    'Type `mix(` and its blanks appear as tags: pick a value for each, Tab moves to the next.',
    'Dashed connections show @references; they come from the formula itself.',
  ].join('\n'));
  note(logic, 40, 760, 272, '**Reference a color**\nThe dashed links come from @logic-brand in the formulas. Change Logic brand and watch its readers update.');
  note(logic, 40, 1080, 272, '**Find it as you type**\nType @ to find Logic brand. Add a dot to browse its channels. Earlier rows appear in suggestions, too.');

  // 8 · All original glossary terms, with one brief note per term.
  const glossary = frame('8 · Glossary', 8, 'neutral', 1360);
  note(glossary, 40, 84, 1120, '**A small field guide**\nLook up a term, then try it in a live example. The first row explains the three ideas behind most color edits.');
  GLOSSARY.forEach(([term, text], i) => note(glossary, 40 + (i % 3) * 388, 240 + Math.floor(i / 3) * 216, 344, `**${term}**\n${text}`));

  // 9 · Gestures live beside the rest of the tutorial, not in the working inspector.
  const basics = frame('9 · Canvas basics', 9, 'blue', 1080);
  tutorial(basics, 'canvas', 'A few gestures. Endless room.', 760);
  note(basics, 40, 900, 1120, '**Make room for your own ideas**\nCreate a personal canvas when you’re ready. Code exports CSS, Tailwind, DTCG tokens or JSON. A share link gives someone their own copy.\nNeed a new color between two nodes? Right-click their connection → Insert a color between.');

  const bindings: Partial<Record<PreviewSlot, string>> = {
    background: tokens['bg/canvas'].id, surface: tokens['bg/surface'].id, border: tokens['border/default'].id,
    text: tokens['text/primary'].id, 'text-muted': tokens['text/muted'].id, primary: tokens['action/primary'].id,
    'on-primary': tokens['action/on-primary'].id, success: tokens['status/success'].id,
    warning: tokens['status/warning'].id, danger: tokens['status/danger'].id,
  };
  return {
    schema: 2, id: SAMPLE_ID, name: '0colors sample', createdAt: now, updatedAt: now,
    themes, nodes, edges, preview: { bindings },
  };
}
