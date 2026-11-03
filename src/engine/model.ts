// ─────────────────────────────────────────────────────────────
// The project document: everything that is saved, shared and undone.
// ─────────────────────────────────────────────────────────────
import type { ChannelValues, Space } from './color/spaces';
import type { MixSpace } from './color/mix';

export type { Space, ChannelValues } from './color/spaces';
export type { MixSpace } from './color/mix';

export interface XY { x: number; y: number }

/** How a derived color channel gets its value. */
export type RuleMode = 'inherit' | 'offset' | 'fixed' | 'formula';

export interface ChannelRule {
  mode: RuleMode;
  /** For 'offset': value = parent + delta. */
  delta?: number;
  /** For 'formula': an expression, see engine/formula.ts. */
  expr?: string;
}

export interface Theme {
  id: string;
  name: string;
  /** Formulas can read `dark` to adapt to the theme. */
  dark: boolean;
}

interface NodeBase<T extends string, D> {
  id: string;
  type: T;
  name: string;
  position: XY;
  data: D;
}

/** A single color. Root colors hold their own values; connected colors follow per-channel rules. */
export type ColorNode = NodeBase<'color', {
  space: Space;
  /** Own values for every channel of `space` plus `alpha` (0..100). Used by 'fixed' rules and roots. */
  values: ChannelValues;
  /** Rules per channel key (and 'alpha'). Missing = inherit. Ignored for roots, except formulas. */
  rules: Record<string, ChannelRule>;
}>;

export type PaletteSpace = 'oklch' | 'hct' | 'hsl';
export type PaletteCurve = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'sine';
export type PaletteNaming = 'tailwind' | 'hundreds' | 'index' | 'tone';
export type ChromaMode = 'constant' | 'taper' | 'manual';

/** Generates a lightness scale from a base hue + chroma (its own, or from the input). */
export type PaletteNode = NodeBase<'palette', {
  space: PaletteSpace;
  /** Base hue and chroma (OKLCH C, HCT C or HSL S) used when no input is connected. */
  hue: number;
  chroma: number;
  steps: number;
  naming: PaletteNaming;
  /** Lightness of the first and last step in the palette's space (OKLCH L%, HCT tone, HSL L). */
  lightStart: number;
  lightEnd: number;
  curve: PaletteCurve;
  chromaMode: ChromaMode;
  /** For 'manual' chroma: chroma at the first and last step. */
  chromaStart: number;
  chromaEnd: number;
  /** Degrees the hue rotates across the scale (centered on the base hue). */
  hueShift: number;
}>;

/** Blends input A into input B in a chosen space. */
export type MixNode = NodeBase<'mix', {
  space: MixSpace;
  /** 0 = all A, 1 = all B. */
  ratio: number;
  /** Fallback colors used while an input is not connected. */
  a: string;
  b: string;
}>;

/** Measures text/background contrast with WCAG 2 and APCA. */
export type ContrastNode = NodeBase<'contrast', {
  fg: string;
  bg: string;
  sample: string;
}>;

/** A semantic design token (e.g. "bg/surface") with one input per theme. */
export type TokenNode = NodeBase<'token', {
  description: string;
}>;

export type NoteTone = 'neutral' | 'yellow' | 'blue' | 'green' | 'pink' | 'purple';

/** Free text on the canvas. Supports **bold**, `code` and "- " bullet lines. */
export type NoteNode = NodeBase<'note', {
  text: string;
  tone: NoteTone;
  width: number;
}>;

/**
 * A titled frame that groups nodes on the canvas (like a Figma section). It has no inputs or outputs;
 * moving it moves the nodes that sit fully inside it.
 */
export type SectionNode = NodeBase<'section', {
  width: number;
  height: number;
  tone: NoteTone;
}>;

/** A built-in tutorial document, rendered by the UI from /tutorials/<doc>.html. */
export type HtmlNode = NodeBase<'html', {
  doc: string;
  width: number;
  height: number;
}>;

export const isHtmlDoc = (doc: unknown): doc is string => typeof doc === 'string' && /^[a-z0-9-]{1,64}$/.test(doc);

export type CanvasNode = ColorNode | PaletteNode | MixNode | ContrastNode | TokenNode | NoteNode | SectionNode | HtmlNode;
export type NodeType = CanvasNode['type'];

export interface Edge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export const PREVIEW_SLOTS = [
  'background', 'surface', 'border', 'text', 'text-muted', 'primary', 'on-primary', 'success', 'warning', 'danger',
] as const;
export type PreviewSlot = (typeof PREVIEW_SLOTS)[number];

export interface Viewport { x: number; y: number; zoom: number }

export interface Project {
  schema: 2;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** themes[0] is the primary theme; other themes fall back to it. */
  themes: Theme[];
  nodes: CanvasNode[];
  edges: Edge[];
  /** Which token node feeds each slot of the live UI preview. */
  preview: { bindings: Partial<Record<PreviewSlot, string>> };
  viewport?: Viewport;
}

// ── Handles ──────────────────────────────────────────────────
// color:    in → out
// palette:  in → out (base), s0..sN (shades)
// mix:      a, b → out
// contrast: fg, bg
// token:    t:<themeId> (one per theme) → out
export const tokenHandle = (themeId: string) => `t:${themeId}`;
export const shadeHandle = (index: number) => `s${index}`;

export function inputHandles(node: CanvasNode, themes: Theme[]): string[] {
  switch (node.type) {
    case 'color':
    case 'palette':
      return ['in'];
    case 'mix':
      return ['a', 'b'];
    case 'contrast':
      return ['fg', 'bg'];
    case 'token':
      return themes.map((t) => tokenHandle(t.id));
    case 'note':
    case 'section':
    case 'html':
      return [];
  }
}

export function hasOutput(type: NodeType): boolean {
  return type !== 'contrast' && !isAnnotation(type);
}

/** Annotations have no @name and never take part in the color graph. */
export function isAnnotation(type: NodeType): boolean {
  return type === 'note' || type === 'section' || type === 'html';
}

/** Name → identifier used in formulas (@brand-blue) and exports (--brand-blue). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'color';
}

export function uid(prefix = ''): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}
