// Factories for nodes, edges and projects.
import {
  type CanvasNode, type ColorNode, type ContrastNode, type Edge, type MixNode, type NodeType, type NoteNode,
  type PaletteNode, type Project, type Theme, type TokenNode, type XY, slugify, uid,
} from './model';
import { type ChannelValues, type ColorInfo, type Space, channelDefs, rgbToSpace, round } from './color/spaces';
import { parseHex, toHex } from './color/convert';
import { oklchToSrgbMapped } from './color/gamut';

export function defaultThemes(): Theme[] {
  return [
    { id: uid('th_'), name: 'Light', dark: false },
    { id: uid('th_'), name: 'Dark', dark: true },
  ];
}

/** Channel values (incl. alpha 0..100) for a hex color in a space, rounded to each channel's precision. */
export function valuesFromHex(space: Space, hex: string): ChannelValues {
  const parsed = parseHex(hex) ?? { rgb: { r: 0.4, g: 0.5, b: 0.9 }, alpha: 1 };
  const v = rgbToSpace(space, parsed.rgb);
  const out: ChannelValues = {};
  for (const def of channelDefs(space, false)) out[def.key] = round(v[def.key], def.decimals);
  out.alpha = Math.round(parsed.alpha * 100);
  return out;
}

export function valuesFromInfo(space: Space, info: ColorInfo): ChannelValues {
  const out: ChannelValues = {};
  const v = rgbToSpace(space, info.rgb);
  for (const def of channelDefs(space, false)) out[def.key] = round(v[def.key], def.decimals);
  out.alpha = Math.round(info.alpha * 100);
  return out;
}

/** Make a name unique among nodes so formula references (@name) stay unambiguous. */
export function uniqueName(nodes: CanvasNode[], base: string, ignoreId?: string): string {
  const taken = new Set(nodes.filter((n) => n.id !== ignoreId && n.type !== 'note').map((n) => slugify(n.name)));
  const clean = base.trim() || 'Color';
  if (!taken.has(slugify(clean))) return clean;
  const stem = clean.replace(/\s+\d+$/, '');
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem} ${i}`;
    if (!taken.has(slugify(candidate))) return candidate;
  }
  return `${stem} ${uid()}`;
}

export function createColorNode(opts: {
  name: string; position: XY; space?: Space; hex?: string; values?: ChannelValues; rules?: ColorNode['data']['rules']; id?: string;
}): ColorNode {
  const space = opts.space ?? 'oklch';
  return {
    id: opts.id ?? uid('n_'),
    type: 'color',
    name: opts.name,
    position: opts.position,
    data: { space, values: opts.values ?? valuesFromHex(space, opts.hex ?? '#4F7DF3'), rules: opts.rules ?? {} },
  };
}

export function createPaletteNode(opts: { name: string; position: XY; id?: string } & Partial<PaletteNode['data']>): PaletteNode {
  const { name, position, id, ...data } = opts;
  return {
    id: id ?? uid('n_'),
    type: 'palette',
    name,
    position,
    data: {
      space: 'oklch', hue: 255, chroma: 0.16, steps: 11, naming: 'tailwind', lightStart: 97, lightEnd: 22,
      curve: 'linear', chromaMode: 'taper', chromaStart: 0.04, chromaEnd: 0.12, hueShift: 0, ...data,
    },
  };
}

export function createMixNode(opts: { name: string; position: XY; id?: string } & Partial<MixNode['data']>): MixNode {
  const { name, position, id, ...data } = opts;
  return { id: id ?? uid('n_'), type: 'mix', name, position, data: { space: 'oklab', ratio: 0.5, a: '#2563EB', b: '#FACC15', ...data } };
}

export function createContrastNode(opts: { name: string; position: XY; id?: string } & Partial<ContrastNode['data']>): ContrastNode {
  const { name, position, id, ...data } = opts;
  return {
    id: id ?? uid('n_'), type: 'contrast', name, position,
    data: { fg: '#1F2937', bg: '#FFFFFF', sample: 'The quick brown fox', ...data },
  };
}

export function createTokenNode(opts: { name: string; position: XY; id?: string; description?: string }): TokenNode {
  return { id: opts.id ?? uid('n_'), type: 'token', name: opts.name, position: opts.position, data: { description: opts.description ?? '' } };
}

export function createNoteNode(opts: { position: XY; text?: string; tone?: NoteNode['data']['tone']; width?: number; id?: string }): NoteNode {
  return {
    id: opts.id ?? uid('n_'), type: 'note', name: 'Note', position: opts.position,
    data: { text: opts.text ?? 'Double-click to edit this note.', tone: opts.tone ?? 'yellow', width: opts.width ?? 260 },
  };
}

export const NODE_LABELS: Record<NodeType, string> = {
  color: 'Color', palette: 'Palette', mix: 'Mix', contrast: 'Contrast', token: 'Token', note: 'Note',
};

/** A fresh node of any type with a unique, friendly name. */
export function createNode(type: NodeType, position: XY, nodes: CanvasNode[]): CanvasNode {
  switch (type) {
    case 'color': return createColorNode({ name: uniqueName(nodes, 'Color'), position, hex: randomPleasantHex() });
    case 'palette': return createPaletteNode({ name: uniqueName(nodes, 'Palette'), position, hue: Math.round(Math.random() * 360) });
    case 'mix': return createMixNode({ name: uniqueName(nodes, 'Mix'), position });
    case 'contrast': return createContrastNode({ name: uniqueName(nodes, 'Contrast'), position });
    case 'token': return createTokenNode({ name: uniqueName(nodes, 'color/token'), position });
    case 'note': return createNoteNode({ position });
  }
}

/** Mid-lightness, moderately vivid OKLCH colors look good on both dark and light canvases. */
export function randomPleasantHex(): string {
  const h = Math.round(Math.random() * 360);
  return toHex(oklchToSrgbMapped({ l: 0.66, c: 0.15, h }).rgb);
}

export function makeEdge(source: string, sourceHandle: string, target: string, targetHandle: string): Edge {
  return { id: uid('e_'), source, sourceHandle, target, targetHandle };
}

export function createBlankProject(name = 'Untitled canvas'): Project {
  const now = Date.now();
  const color = createColorNode({ name: 'Brand', position: { x: 0, y: 0 }, hex: '#4F7DF3' });
  return {
    schema: 2, id: uid('p_'), name, createdAt: now, updatedAt: now,
    themes: defaultThemes(), nodes: [color], edges: [], preview: { bindings: {} },
  };
}
