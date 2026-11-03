// ─────────────────────────────────────────────────────────────
// Code panel: the canvas as CSS variables, Tailwind v4, DTCG or plain JSON.
// ─────────────────────────────────────────────────────────────
import { type ReactNode, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { slugify } from '@/engine/model';
import {
  type ColorFormat, type ExportFormat, type ExportOptions, EXPORT_FORMATS, exportProject,
} from '@/engine/export';
import { useEditor } from '../store';
import { CopyButton, FieldRow, IconButton, Section, Segmented, Select, Switch } from '../ui';
import { downloadText } from './download';
import { highlight } from './highlight';

const STORAGE_KEY = '0colors:code-options';
const FORMATS = Object.keys(EXPORT_FORMATS) as ExportFormat[];
const SHORT: Record<ExportFormat, string> = { css: 'CSS', tailwind: 'Tailwind', dtcg: 'DTCG', json: 'JSON' };
const COLOR_FORMATS: { value: ColorFormat; label: string }[] = [
  { value: 'hex', label: 'HEX' },
  { value: 'oklch', label: 'OKLCH' },
  { value: 'hsl', label: 'HSL' },
  { value: 'rgb', label: 'RGB' },
];
const SINGLE_THEME: ExportFormat[] = ['dtcg'];

type Stored = Omit<ExportOptions, 'themeId'>;
const DEFAULTS: Stored = { format: 'css', colorFormat: 'hex', includePrimitives: true, useAliases: true };

function loadOptions(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Stored> | null;
    if (!raw) return DEFAULTS;
    return {
      format: FORMATS.includes(raw.format as ExportFormat) ? (raw.format as ExportFormat) : DEFAULTS.format,
      colorFormat: COLOR_FORMATS.some((c) => c.value === raw.colorFormat) ? (raw.colorFormat as ColorFormat) : DEFAULTS.colorFormat,
      includePrimitives: typeof raw.includePrimitives === 'boolean' ? raw.includePrimitives : DEFAULTS.includePrimitives,
      useAliases: typeof raw.useAliases === 'boolean' ? raw.useAliases : DEFAULTS.useAliases,
    };
  } catch {
    return DEFAULTS;
  }
}

// ── Panel ────────────────────────────────────────────────────
export function CodePanel() {
  const liveProject = useEditor((s) => s.project);
  const project = useDeferredValue(liveProject);
  const activeThemeId = useEditor((s) => s.themeId);
  const [options, setOptions] = useState<Stored>(loadOptions);
  const [themeId, setThemeId] = useState<string>(activeThemeId);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    } catch {
      // Storage blocked — options just won't persist.
    }
  }, [options]);

  const validThemeId = project.themes.some((t) => t.id === themeId) ? themeId : project.themes[0]?.id;
  const singleTheme = SINGLE_THEME.includes(options.format);
  const meta = EXPORT_FORMATS[options.format];

  const output = useMemo(() => {
    try {
      return exportProject(project, { ...options, themeId: validThemeId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return meta.language === 'json' ? JSON.stringify({ error: msg }, null, 2) : `/* Export failed: ${msg} */`;
    }
  }, [project, options, validThemeId, meta.language]);

  const highlighted = useMemo(() => highlight(output, meta.language), [output, meta.language]);
  const set = <K extends keyof Stored>(k: K, v: Stored[K]) => setOptions((o) => ({ ...o, [k]: v }));

  const darkSlug = slugify(project.themes.find((t, i) => i > 0 && t.dark)?.name ?? project.themes[1]?.name ?? 'dark');
  const usage: Record<ExportFormat, ReactNode> = {
    css: <>Paste into your stylesheet. The first theme lives on <code className="num text-fg">:root</code>; switch with <code className="num text-fg">{`<html data-theme="${darkSlug}">`}</code>.</>,
    tailwind: <>Use as your Tailwind v4 entry CSS — utilities like <code className="num text-fg">bg-bg-surface</code> are generated from <code className="num text-fg">--color-*</code>.</>,
    dtcg: <>W3C Design Tokens (2025.10) for Style Dictionary, Tokens Studio and other importers — one file per theme.</>,
    json: <>Resolved values for every theme. Handy for scripts, tests and documentation.</>,
  };

  const fileName = singleTheme
    ? meta.fileName.replace(/(\.[a-z]+)$/, `.${slugify(project.themes.find((t) => t.id === validThemeId)?.name ?? 'theme')}$1`)
    : meta.fileName;

  return (
    <div>
      <Section title="Export">
        <Segmented
          size="sm"
          className="mb-3"
          value={options.format}
          onChange={(v) => set('format', v)}
          options={FORMATS.map((f) => ({ value: f, label: SHORT[f], title: EXPORT_FORMATS[f].label }))}
        />
        <FieldRow label="Colors">
          <Select label="Color format" value={options.colorFormat} options={COLOR_FORMATS} onChange={(v) => set('colorFormat', v)} />
        </FieldRow>
        {singleTheme && (
          <FieldRow label="Theme">
            <Select
              label="Theme to export"
              value={validThemeId ?? ''}
              options={project.themes.map((t) => ({ value: t.id, label: t.name }))}
              onChange={setThemeId}
            />
          </FieldRow>
        )}
        <div className="mt-1 flex flex-col">
          <label className="flex h-8 items-center justify-between gap-3 text-[12px] text-fg-2">
            <span>Include primitives</span>
            <Switch label="Include primitives" checked={options.includePrimitives} onChange={(v) => set('includePrimitives', v)} />
          </label>
          <label className="flex h-8 items-center justify-between gap-3 text-[12px] text-fg-2">
            <span>Use aliases <span className="text-fg-3">(var references)</span></span>
            <Switch label="Use aliases" checked={options.useAliases} onChange={(v) => set('useAliases', v)} />
          </label>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-fg-3">{usage[options.format]}</p>
      </Section>

      <Section
        title={meta.label}
        actions={
          <div className="-mr-1.5 flex items-center">
            <CopyButton text={output} label={`Copy ${meta.label}`} className="h-7 w-7" />
            <IconButton
              label={`Download ${fileName}`}
              size="icon-sm"
              onClick={() => downloadText(fileName, output, meta.language === 'json' ? 'application/json' : 'text/css')}
            >
              <Download size={13} />
            </IconButton>
          </div>
        }
      >
        <pre className="num overflow-x-auto whitespace-pre rounded-[10px] bg-surface-2 px-3 py-2.5 text-[11px] leading-[1.7] text-fg-2">
          <code>{highlighted}</code>
        </pre>
      </Section>
    </div>
  );
}
