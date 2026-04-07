import { describe, it, expect } from 'vitest';
import { slugify, findProjectBySlug } from './slugify';

describe('slugify', () => {
  it('lowercases and replaces spaces', () => {
    expect(slugify('My Project')).toBe('my-project');
  });

  it('strips accents', () => {
    expect(slugify('Café 101')).toBe('cafe-101');
  });

  it('returns untitled for empty-ish input', () => {
    expect(slugify('!!!')).toBe('untitled');
  });
});

describe('findProjectBySlug', () => {
  const projects = [
    { id: 'p-1', name: 'Alpha' },
    { id: 'p-2', name: 'Beta Gamma' },
  ];

  it('resolves by slugified name', () => {
    expect(findProjectBySlug(projects, 'beta-gamma')?.id).toBe('p-2');
  });

  it('falls back to id match', () => {
    expect(findProjectBySlug(projects, 'p-1')?.name).toBe('Alpha');
  });
});
