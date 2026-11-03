// Exporters: CSS custom properties, Tailwind v4 @theme, DTCG JSON and plain JSON.
// Primitives are the raw colors (color nodes, mix nodes, palette shades); tokens are
// the semantic names. With aliases on, tokens point at what feeds them, so the
// output mirrors the graph: button/bg → var(--brand) instead of a copied hex value.
import { type CanvasNode, type Project, type Theme, isAnnotation, slugify } from './model';
import { type ComputeResult, computeAllThemes, outputColor } from './compute';
import { type ColorInfo, cssColor, round } from './color/spaces';

export type ExportFormat = 'css' | 'tailwind' | 'dtcg' | 'json';
export type ColorFormat = 'hex' | 'oklch' | 'hsl' | 'rgb';

export interface ExportOptions {
  format: ExportFormat;
  colorFormat: ColorFormat;
  includePrimitives: boolean;
  useAliases: boolean;
  /** Theme for single-theme formats (DTCG). Defaults to the primary theme. */
  themeId?: string;
}

export const EXPORT_FORMATS: Record<ExportFormat, { label: string; language: 'css' | 'json'; fileName: string }> = {
  css: { label: 'CSS variables', language: 'css', fileName: 'tokens.css' },
  tailwind: { label: 'Tailwind v4', language: 'css', fileName: 'theme.css' },
  dtcg: { label: 'DTCG JSON', language: 'json', fileName: 'tokens.json' },
  json: { label: 'JSON', language: 'json', fileName: 'colors.json' },
};

interface Entry {
  kind: 'primitive' | 'token';
  nodeId: string;
  /** Output handle the value is read from. */
  handle: string;
  /** CSS-safe name without the leading dashes, e.g. "neutral-500" or "bg-surface". */
  key: string;
  /** Nested path for DTCG, e.g. ["primitive", "neutral", "500"] or ["bg", "surface"]. */
  path: string[];
  /** Human name: the token name or "Neutral 500". */
  name: string;
  description: string;
}

type Resolved =
  | { kind: 'value'; info: ColorInfo }
  | { kind: 'alias'; target: Entry; info: ColorInfo }
  | { kind: 'missing' };

const tokenSegments = (name: string) => {
  const parts = name.split(/[/.]/).map((s) => s.trim()).filter(Boolean).map(slugify);
  return parts.length ? parts : ['token'];
};

function collectEntries(nodes: CanvasNode[], primary: ComputeResult) {
  const tokens: Entry[] = [];
  const primitives: Entry[] = [];
  for (const node of nodes) {
    if (isAnnotation(node.type)) continue;
    if (node.type === 'token') {
      const path = tokenSegments(node.name);
      tokens.push({ kind: 'token', nodeId: node.id, handle: 'out', key: path.join('-'), path, name: node.name, description: node.data.description.trim() });
    } else if (node.type === 'color' || node.type === 'mix') {
      const slug = slugify(node.name);
      primitives.push({ kind: 'primitive', nodeId: node.id, handle: 'out', key: slug, path: ['primitive', slug], name: node.name, description: '' });
    } else if (node.type === 'palette') {
      const result = primary.nodes[node.id];
      if (result?.type !== 'palette') continue;
      const slug = slugify(node.name);
      for (const shade of result.shades) {
        const step = slugify(shade.name);
        primitives.push({
          kind: 'primitive', nodeId: node.id, handle: `s${shade.index}`, key: `${slug}-${step}`,
          path: ['primitive', slug, step], name: `${node.name} ${shade.name}`, description: '',
        });
      }
    }
  }
  // Tokens are the public names, so they keep their key when a primitive collides.
  const taken = new Set<string>();
  for (const e of [...tokens, ...primitives]) {
    let key = e.key;
    for (let i = 2; taken.has(key); i++) key = `${e.key}-${i}`;
    taken.add(key);
    e.key = key;
  }
  const byOutput = new Map<string, Entry>();
  for (const p of primitives) byOutput.set(`${p.nodeId}\u0000${p.handle}`, p);
  const byToken = new Map(tokens.map((t) => [t.nodeId, t]));
  return { tokens, primitives, byOutput, byToken };
}

type Entries = ReturnType<typeof collectEntries>;

function resolve(entry: Entry, result: ComputeResult, entries: Entries, opts: ExportOptions): Resolved {
  const r = result.nodes[entry.nodeId];
  if (entry.kind === 'primitive') {
    const info = outputColor(r, entry.handle);
    return info ? { kind: 'value', info } : { kind: 'missing' };
  }
  if (r?.type !== 'token' || !r.color) return { kind: 'missing' };
  if (opts.useAliases && r.source) {
    const viaToken = entries.byToken.get(r.source.nodeId);
    if (viaToken) return { kind: 'alias', target: viaToken, info: r.color };
    const viaPrimitive = opts.includePrimitives ? entries.byOutput.get(`${r.source.nodeId}\u0000${r.source.handle}`) : undefined;
    if (viaPrimitive) return { kind: 'alias', target: viaPrimitive, info: r.color };
  }
  return { kind: 'value', info: r.color };
}

const themeSlugs = (themes: Theme[]) => {
  const taken = new Set<string>();
  return themes.map((t) => {
    const base = slugify(t.name);
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    taken.add(slug);
    return slug;
  });
};

// ── CSS & Tailwind ───────────────────────────────────────────
const commentText = (text: string) => text.replace(/\*\//g, '* /');

function declaration(entry: Entry, value: Resolved, prefix: string, opts: ExportOptions): string {
  switch (value.kind) {
    case 'missing': return `  /* ${commentText(entry.name)}: not assigned */`;
    case 'alias': return `  --${prefix}${entry.key}: var(--${prefix}${value.target.key});`;
    case 'value': return `  --${prefix}${entry.key}: ${cssColor(value.info, opts.colorFormat)};`;
  }
}

function themeBlocks(project: Project, all: Record<string, ComputeResult>, entries: Entries, opts: ExportOptions, prefix: string) {
  const included = [...(opts.includePrimitives ? entries.primitives : []), ...entries.tokens];
  const slugs = themeSlugs(project.themes);
  return project.themes.map((theme, i) => ({
    theme,
    slug: slugs[i],
    lines: included.map((e) => ({ entry: e, line: declaration(e, resolve(e, all[theme.id], entries, opts), prefix, opts) })),
  }));
}

function sectioned(lines: { entry: Entry; line: string }[]): string[] {
  const prims = lines.filter((l) => l.entry.kind === 'primitive').map((l) => l.line);
  const toks = lines.filter((l) => l.entry.kind === 'token').map((l) => l.line);
  const out: string[] = [];
  if (prims.length) out.push('  /* Primitives */', ...prims);
  if (prims.length && toks.length) out.push('');
  if (toks.length) out.push('  /* Tokens */', ...toks);
  return out;
}

function diffLines(base: { line: string }[], other: { entry: Entry; line: string }[]) {
  return other.filter((l, i) => l.line !== base[i].line && !l.line.trimStart().startsWith('/*'));
}

function exportCss(project: Project, all: Record<string, ComputeResult>, entries: Entries, opts: ExportOptions): string {
  const blocks = themeBlocks(project, all, entries, opts, '');
  const [primary, ...rest] = blocks;
  const out = [
    `/* Generated by 0colors — ${commentText(project.name)} */`,
    `/* The first theme (${commentText(primary.theme.name)}) is the default. Switch themes with <html data-theme="${rest[0]?.slug ?? 'dark'}">. */`,
    '',
    `/* ${commentText(primary.theme.name)} */`,
    ':root {',
    ...sectioned(primary.lines),
    '}',
  ];
  for (const block of rest) {
    const changed = diffLines(primary.lines, block.lines);
    out.push('', `/* ${commentText(block.theme.name)} */`, `[data-theme="${block.slug}"] {`);
    out.push(...(changed.length ? sectioned(changed) : [`  /* Same as ${commentText(primary.theme.name)} */`]), '}');
  }
  return out.join('\n') + '\n';
}

function exportTailwind(project: Project, all: Record<string, ComputeResult>, entries: Entries, opts: ExportOptions): string {
  const blocks = themeBlocks(project, all, entries, opts, 'color-');
  const [primary, ...rest] = blocks;
  const dark = rest.find((b) => b.theme.dark);
  const out = [`/* Generated by 0colors — ${commentText(project.name)} */`, '@import "tailwindcss";', ''];
  if (dark) out.push(`@custom-variant dark (&:where([data-theme=${dark.slug}], [data-theme=${dark.slug}] *));`, '');
  out.push(`/* ${commentText(primary.theme.name)} (default) */`, '@theme {', ...sectioned(primary.lines), '}');
  for (const block of rest) {
    const changed = diffLines(primary.lines, block.lines);
    out.push('', `/* ${commentText(block.theme.name)} */`, `[data-theme="${block.slug}"] {`);
    out.push(...(changed.length ? sectioned(changed) : [`  /* Same as ${commentText(primary.theme.name)} */`]), '}');
  }
  return out.join('\n') + '\n';
}

// ── DTCG ─────────────────────────────────────────────────────
function dtcgValue(info: ColorInfo, format: ColorFormat) {
  const alpha = round(info.alpha, 4);
  const hex = info.hex.toLowerCase();
  if (format === 'oklch') {
    return { colorSpace: 'oklch', components: [round(info.oklch.l, 4), round(info.oklch.c, 4), round(info.oklch.h, 4)], alpha, hex };
  }
  return { colorSpace: 'srgb', components: [round(info.rgb.r, 4), round(info.rgb.g, 4), round(info.rgb.b, 4)], alpha, hex };
}

/** Final DTCG paths: duplicates get a suffix; a token that is also a group becomes that group's `$root`. */
function dtcgPaths(list: Entry[]): Map<Entry, string[]> {
  const out = new Map<Entry, string[]>();
  const seen = new Set<string>();
  for (const e of list) {
    const path = [...e.path];
    const last = path.length - 1;
    for (let i = 2; seen.has(path.join('.')); i++) path[last] = `${e.path[last]}-${i}`;
    seen.add(path.join('.'));
    out.set(e, path);
  }
  const groups = new Set<string>();
  for (const path of out.values()) for (let i = 1; i < path.length; i++) groups.add(path.slice(0, i).join('.'));
  for (const [e, path] of out) if (groups.has(path.join('.'))) out.set(e, [...path, '$root']);
  return out;
}

function exportDtcg(project: Project, all: Record<string, ComputeResult>, entries: Entries, opts: ExportOptions): string {
  const theme = project.themes.find((t) => t.id === opts.themeId) ?? project.themes[0];
  const result = all[theme.id];
  const list = [...(opts.includePrimitives ? entries.primitives : []), ...entries.tokens];
  const paths = dtcgPaths(list);
  const root: Record<string, unknown> = { $description: `0colors — ${project.name} (${theme.name} theme)` };

  for (const e of list) {
    const value = resolve(e, result, entries, opts);
    if (value.kind === 'missing') continue;
    const path = paths.get(e)!;
    let group = root;
    for (const seg of path.slice(0, -1)) {
      if (typeof group[seg] !== 'object' || group[seg] === null) group[seg] = {};
      group = group[seg] as Record<string, unknown>;
    }
    const token: Record<string, unknown> = {
      $type: 'color',
      $value: value.kind === 'alias' && paths.has(value.target) ? `{${paths.get(value.target)!.join('.')}}` : dtcgValue(value.info, opts.colorFormat),
    };
    if (e.description) token.$description = e.description;
    group[path[path.length - 1]] = token;
  }
  return JSON.stringify(root, null, 2) + '\n';
}

// ── Plain JSON ───────────────────────────────────────────────
function exportJson(project: Project, all: Record<string, ComputeResult>, entries: Entries, opts: ExportOptions): string {
  const out: Record<string, unknown> = Object.create(null);
  const literal = { ...opts, useAliases: false };
  for (const theme of project.themes) {
    let key = theme.name;
    for (let i = 2; Object.hasOwn(out, key); i++) key = `${theme.name} ${i}`;
    const tokens: Record<string, string | null> = Object.create(null);
    for (const e of entries.tokens) {
      const v = resolve(e, all[theme.id], entries, literal);
      let name = e.name;
      for (let i = 2; Object.hasOwn(tokens, name); i++) name = `${e.name} ${i}`;
      tokens[name] = v.kind === 'missing' ? null : cssColor(v.info, opts.colorFormat);
    }
    const section: Record<string, unknown> = { tokens };
    if (opts.includePrimitives) {
      const primitives: Record<string, string> = {};
      for (const e of entries.primitives) {
        const v = resolve(e, all[theme.id], entries, literal);
        if (v.kind !== 'missing') primitives[e.key] = cssColor(v.info, opts.colorFormat);
      }
      section.primitives = primitives;
    }
    out[key] = section;
  }
  return JSON.stringify(out, null, 2) + '\n';
}

export function exportProject(project: Project, options: ExportOptions): string {
  const all = computeAllThemes(project);
  const primary = all[project.themes[0]?.id];
  if (!primary) return '';
  const entries = collectEntries(project.nodes, primary);
  switch (options.format) {
    case 'css': return exportCss(project, all, entries, options);
    case 'tailwind': return exportTailwind(project, all, entries, options);
    case 'dtcg': return exportDtcg(project, all, entries, options);
    case 'json': return exportJson(project, all, entries, options);
  }
}
