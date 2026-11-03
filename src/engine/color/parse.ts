import { type RGB, clamp, clamp01, hslToRgb, oklabToOklch, parseHex, wrapHue } from './convert';
import { oklchToSrgbMapped } from './gamut';

export interface ParsedColor { rgb: RGB; alpha: number; name?: string; source: string; index: number }

// CSS absolute named colors. System colors and currentColor need a DOM context.
const NAMED: Record<string, string> = {
  aliceblue: 'F0F8FF', antiquewhite: 'FAEBD7', aqua: '00FFFF', aquamarine: '7FFFD4', azure: 'F0FFFF',
  beige: 'F5F5DC', bisque: 'FFE4C4', black: '000000', blanchedalmond: 'FFEBCD', blue: '0000FF', blueviolet: '8A2BE2', brown: 'A52A2A', burlywood: 'DEB887',
  cadetblue: '5F9EA0', chartreuse: '7FFF00', chocolate: 'D2691E', coral: 'FF7F50', cornflowerblue: '6495ED', cornsilk: 'FFF8DC', crimson: 'DC143C', cyan: '00FFFF',
  darkblue: '00008B', darkcyan: '008B8B', darkgoldenrod: 'B8860B', darkgray: 'A9A9A9', darkgreen: '006400', darkgrey: 'A9A9A9', darkkhaki: 'BDB76B',
  darkmagenta: '8B008B', darkolivegreen: '556B2F', darkorange: 'FF8C00', darkorchid: '9932CC', darkred: '8B0000', darksalmon: 'E9967A', darkseagreen: '8FBC8F',
  darkslateblue: '483D8B', darkslategray: '2F4F4F', darkslategrey: '2F4F4F', darkturquoise: '00CED1', darkviolet: '9400D3', deeppink: 'FF1493', deepskyblue: '00BFFF',
  dimgray: '696969', dimgrey: '696969', dodgerblue: '1E90FF', firebrick: 'B22222', floralwhite: 'FFFAF0', forestgreen: '228B22', fuchsia: 'FF00FF',
  gainsboro: 'DCDCDC', ghostwhite: 'F8F8FF', gold: 'FFD700', goldenrod: 'DAA520', gray: '808080', green: '008000', greenyellow: 'ADFF2F', grey: '808080',
  honeydew: 'F0FFF0', hotpink: 'FF69B4', indianred: 'CD5C5C', indigo: '4B0082', ivory: 'FFFFF0', khaki: 'F0E68C', lavender: 'E6E6FA', lavenderblush: 'FFF0F5',
  lawngreen: '7CFC00', lemonchiffon: 'FFFACD', lightblue: 'ADD8E6', lightcoral: 'F08080', lightcyan: 'E0FFFF', lightgoldenrodyellow: 'FAFAD2', lightgray: 'D3D3D3',
  lightgreen: '90EE90', lightgrey: 'D3D3D3', lightpink: 'FFB6C1', lightsalmon: 'FFA07A', lightseagreen: '20B2AA', lightskyblue: '87CEFA', lightslategray: '778899',
  lightslategrey: '778899', lightsteelblue: 'B0C4DE', lightyellow: 'FFFFE0', lime: '00FF00', limegreen: '32CD32', linen: 'FAF0E6', magenta: 'FF00FF', maroon: '800000',
  mediumaquamarine: '66CDAA', mediumblue: '0000CD', mediumorchid: 'BA55D3', mediumpurple: '9370DB', mediumseagreen: '3CB371', mediumslateblue: '7B68EE',
  mediumspringgreen: '00FA9A', mediumturquoise: '48D1CC', mediumvioletred: 'C71585', midnightblue: '191970', mintcream: 'F5FFFA', mistyrose: 'FFE4E1', moccasin: 'FFE4B5',
  navajowhite: 'FFDEAD', navy: '000080', oldlace: 'FDF5E6', olive: '808000', olivedrab: '6B8E23', orange: 'FFA500', orangered: 'FF4500', orchid: 'DA70D6',
  palegoldenrod: 'EEE8AA', palegreen: '98FB98', paleturquoise: 'AFEEEE', palevioletred: 'DB7093', papayawhip: 'FFEFD5', peachpuff: 'FFDAB9', peru: 'CD853F', pink: 'FFC0CB',
  plum: 'DDA0DD', powderblue: 'B0E0E6', purple: '800080', rebeccapurple: '663399', red: 'FF0000', rosybrown: 'BC8F8F', royalblue: '4169E1',
  saddlebrown: '8B4513', salmon: 'FA8072', sandybrown: 'F4A460', seagreen: '2E8B57', seashell: 'FFF5EE', sienna: 'A0522D', silver: 'C0C0C0', skyblue: '87CEEB',
  slateblue: '6A5ACD', slategray: '708090', slategrey: '708090', snow: 'FFFAFA', springgreen: '00FF7F', steelblue: '4682B4', tan: 'D2B48C', teal: '008080',
  thistle: 'D8BFD8', tomato: 'FF6347', turquoise: '40E0D0', violet: 'EE82EE', wheat: 'F5DEB3', white: 'FFFFFF', whitesmoke: 'F5F5F5', yellow: 'FFFF00', yellowgreen: '9ACD32',
};

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function component(text: string, percentScale: number, allowNone = true): number | null {
  if (allowNone && text.toLowerCase() === 'none') return 0;
  const percent = text.endsWith('%');
  const raw = percent ? text.slice(0, -1) : text;
  if (!NUMBER.test(raw)) return null;
  const value = percent ? Number(raw) / 100 * percentScale : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function angle(text: string, allowNone: boolean): number | null {
  if (allowNone && text.toLowerCase() === 'none') return 0;
  const match = /^(.*?)(deg|grad|rad|turn)?$/i.exec(text);
  if (!match || !NUMBER.test(match[1])) return null;
  const multiplier = ({ deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 } as Record<string, number>)[match[2]?.toLowerCase() ?? 'deg'];
  const value = Number(match[1]) * multiplier;
  return Number.isFinite(value) ? wrapHue(value) : null;
}

function functional(source: string): { rgb: RGB; alpha: number } | null {
  const match = /^([a-z]+)\s*\(([^()]*)\)$/i.exec(source);
  if (!match) return null;
  const fn = match[1].toLowerCase();
  const body = match[2].replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
  const legacy = body.includes(',');
  let channels: string[];
  let alphaText: string | undefined;
  if (legacy) {
    if (body.includes('/') || fn === 'oklch' || fn === 'oklab') return null;
    const parts = body.split(',').map((p) => p.trim());
    if (parts.length !== 3 && parts.length !== 4) return null;
    channels = parts.slice(0, 3);
    alphaText = parts[3];
  } else {
    const parts = body.split('/');
    if (parts.length > 2) return null;
    channels = parts[0].trim().split(/\s+/);
    if (channels.length !== 3) return null;
    alphaText = parts[1]?.trim();
  }
  const alphaRaw = alphaText === undefined ? 1 : component(alphaText, 1, !legacy);
  if (alphaRaw === null) return null;
  const alpha = clamp01(alphaRaw);
  if (fn === 'rgb' || fn === 'rgba') {
    // Legacy comma syntax requires three numbers or three percentages.
    if (legacy && channels.some((c) => c.endsWith('%')) && !channels.every((c) => c.endsWith('%'))) return null;
    const values = channels.map((c) => component(c, 255, !legacy));
    if (values.some((v) => v === null)) return null;
    const [r, g, b] = values as number[];
    return { rgb: { r: clamp(r, 0, 255) / 255, g: clamp(g, 0, 255) / 255, b: clamp(b, 0, 255) / 255 }, alpha };
  }
  if (fn === 'hsl' || fn === 'hsla') {
    if (legacy && (!channels[1].endsWith('%') || !channels[2].endsWith('%'))) return null;
    const h = angle(channels[0], !legacy);
    const s = component(channels[1], 100, !legacy);
    const l = component(channels[2], 100, !legacy);
    return h === null || s === null || l === null ? null : { rgb: hslToRgb({ h, s, l }), alpha };
  }
  const l = component(channels[0], 1);
  if (l === null) return null;
  if (fn === 'oklch') {
    const c = component(channels[1], 0.4);
    const h = angle(channels[2], true);
    if (c === null || h === null) return null;
    return { rgb: oklchToSrgbMapped({ l: clamp01(l), c: Math.max(0, c), h }).rgb, alpha };
  }
  if (fn === 'oklab') {
    const a = component(channels[1], 0.4);
    const b = component(channels[2], 0.4);
    if (a === null || b === null) return null;
    const lch = oklabToOklch({ l: clamp01(l), a, b });
    if (!Number.isFinite(lch.c)) return null;
    return { rgb: oklchToSrgbMapped(lch).rgb, alpha };
  }
  return null;
}

function declarationName(text: string, index: number): string | undefined {
  const prefix = text.slice(0, index);
  const match = /(?:^|[;{,\r\n])\s*(?:"((?:[^"\\\r\n]|\\.)+)"|'([^'\r\n]+)'|([\w-]+))\s*:\s*["']?\s*$/.exec(prefix);
  if (!match) return undefined;
  let name = match[1] ?? match[2] ?? match[3];
  if (match[1]) {
    try { name = JSON.parse(`"${match[1]}"`) as string; } catch { /* Preserve a plain label even outside strict JSON. */ }
  }
  return name.replace(/^--/, '') || undefined;
}

/** CSS colors in reading order; named colors are accepted only as the entire input. */
export function parseColors(text: string): ParsedColor[] {
  const trimmed = text.trim();
  const named = trimmed.toLowerCase();
  if (Object.hasOwn(NAMED, named) || named === 'transparent') {
    const parsed = parseHex(named === 'transparent' ? '#0000' : `#${NAMED[named]}`)!;
    return [{ ...parsed, source: trimmed, index: text.indexOf(trimmed), name: named }];
  }
  const out: ParsedColor[] = [];
  const candidates = /#[\w-]+|(?:rgba?|hsla?|oklch|oklab)\s*\([^()]*\)/gi;
  for (const match of text.matchAll(candidates)) {
    const index = match.index;
    if (index > 0 && /[\w#-]/.test(text[index - 1])) continue;
    const source = match[0];
    const parsed = source.startsWith('#') ? parseHex(source) : functional(source);
    if (!parsed || !Object.values(parsed.rgb).every(Number.isFinite)) continue;
    const name = declarationName(text, index);
    out.push({ ...parsed, source, index, ...(name ? { name } : {}) });
  }
  return out;
}
