import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import type { TokenNode } from '@/engine/model';
import { exportProject } from '@/engine/export';
import { createSampleProject } from '../sample';
import { autoBind } from './preview-bind';
import { highlight } from './highlight';

const text = (nodes: ReactNode[]): string =>
  nodes.map((n) => (typeof n === 'string' ? n : isValidElement<{ children: string }>(n) ? n.props.children : '')).join('');

describe('preview auto-binding', () => {
  it('binds the sample tokens to the expected slots', () => {
    const project = createSampleProject();
    const tokens = project.nodes.filter((n): n is TokenNode => n.type === 'token');
    const found = autoBind(tokens);
    const name = (id?: string) => tokens.find((t) => t.id === id)?.name;
    expect(name(found.background)).toBe('bg/canvas');
    expect(name(found.surface)).toBe('bg/surface');
    expect(name(found.border)).toBe('border/default');
    expect(name(found.text)).toBe('text/primary');
    expect(name(found['text-muted'])).toBe('text/muted');
    expect(name(found.primary)).toBe('action/primary');
    expect(name(found['on-primary'])).toBe('action/on-primary');
    expect(name(found.success)).toBe('status/success');
    expect(name(found.warning)).toBe('status/warning');
    expect(name(found.danger)).toBe('status/danger');
  });

  it('returns nothing when no names match', () => {
    const t = { id: 'x', type: 'token', name: 'foo', position: { x: 0, y: 0 }, data: { description: '' } } as TokenNode;
    expect(autoBind([t])).toEqual({});
  });
});

describe('code highlighter', () => {
  const project = createSampleProject();
  for (const format of ['css', 'tailwind', 'dtcg', 'json'] as const) {
    it(`keeps every character of ${format} output`, () => {
      const code = exportProject(project, { format, colorFormat: 'oklch', includePrimitives: true, useAliases: true });
      expect(code.length).toBeGreaterThan(100);
      const language = format === 'css' || format === 'tailwind' ? 'css' : 'json';
      expect(text(highlight(code, language))).toBe(code);
    });
  }
});
