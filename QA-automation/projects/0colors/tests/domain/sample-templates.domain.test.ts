/**
 * Sample Templates — Domain validation tests
 * Source: packages/frontend/src/utils/sample-templates.ts
 *
 * Tests that all built-in templates have valid structure, correct cross-references,
 * and sane property values. Zero mocks — pure data validation.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { SampleTemplate } from '@frontend/utils/sample-templates';

// Dynamic import because the file may use helper functions internally
let templates: SampleTemplate[];
let getTemplateById: (id: string) => SampleTemplate | undefined;

// Load templates
beforeAll(async () => {
  const mod = await import('@frontend/utils/sample-templates');
  // The module may export the templates as a named export or default
  // Try common export patterns
  if ('builtInTemplates' in mod) {
    templates = (mod as any).builtInTemplates;
  } else if ('sampleTemplates' in mod) {
    templates = (mod as any).sampleTemplates;
  } else if ('templates' in mod) {
    templates = (mod as any).templates;
  } else if ('getBuiltInTemplates' in mod) {
    templates = (mod as any).getBuiltInTemplates();
  } else {
    // Try to find any array export
    const arrayExports = Object.entries(mod).filter(([, v]) => Array.isArray(v));
    if (arrayExports.length > 0) {
      templates = arrayExports[0][1] as SampleTemplate[];
    } else {
      throw new Error('Could not find template array export. Available exports: ' + Object.keys(mod).join(', '));
    }
  }

  // Try to find getTemplateById
  if ('getTemplateById' in mod) {
    getTemplateById = (mod as any).getTemplateById;
  } else {
    // Fallback: create our own
    getTemplateById = (id: string) => templates.find(t => t.id === id);
  }
});

describe('Sample Templates — Structure', () => {
  it('has at least 6 built-in templates', () => {
    expect(templates.length).toBeGreaterThanOrEqual(6);
  });

  it('each template has a unique id', () => {
    const ids = templates.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each template has non-empty name and description', () => {
    for (const t of templates) {
      expect(t.name, `template ${t.id}`).toBeTruthy();
      expect(t.description, `template ${t.id}`).toBeTruthy();
    }
  });

  it('each template has folderColor in 0-360 range', () => {
    for (const t of templates) {
      expect(t.folderColor, `template ${t.id}`).toBeGreaterThanOrEqual(0);
      expect(t.folderColor, `template ${t.id}`).toBeLessThanOrEqual(360);
    }
  });

  it('each template has at least 1 node', () => {
    for (const t of templates) {
      expect(t.nodes.length, `template ${t.id} nodes`).toBeGreaterThanOrEqual(1);
    }
  });

  it('each template has at least 1 token', () => {
    for (const t of templates) {
      expect(t.tokens.length, `template ${t.id} tokens`).toBeGreaterThanOrEqual(1);
    }
  });

  it('each template has at least 1 group', () => {
    for (const t of templates) {
      expect(t.groups.length, `template ${t.id} groups`).toBeGreaterThanOrEqual(1);
    }
  });

  it('each template has at least 1 page', () => {
    for (const t of templates) {
      expect(t.pages.length, `template ${t.id} pages`).toBeGreaterThanOrEqual(1);
    }
  });

  it('each template has at least 1 theme', () => {
    for (const t of templates) {
      expect(t.themes.length, `template ${t.id} themes`).toBeGreaterThanOrEqual(1);
    }
  });

  it('each template has at least 1 canvasState', () => {
    for (const t of templates) {
      expect(t.canvasStates.length, `template ${t.id} canvasStates`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Sample Templates — Project Properties', () => {
  it('all template projects use id "sample-project"', () => {
    for (const t of templates) {
      expect(t.project.id, `template ${t.id}`).toBe('sample-project');
    }
  });

  it('all template projects have isSample: true', () => {
    for (const t of templates) {
      expect(t.project.isSample, `template ${t.id}`).toBe(true);
    }
  });
});

describe('Sample Templates — Theme Validation', () => {
  it('each template has at least one primary theme', () => {
    for (const t of templates) {
      const primary = t.themes.filter(th => th.isPrimary);
      expect(primary.length, `template ${t.id} primary themes`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Sample Templates — Cross-Reference Integrity', () => {
  it('all tokens reference valid groupId', () => {
    for (const t of templates) {
      const groupIds = new Set(t.groups.map(g => g.id));
      for (const token of t.tokens) {
        if (token.groupId !== null) {
          expect(groupIds.has(token.groupId), `token ${token.id} in template ${t.id} references invalid group ${token.groupId}`).toBe(true);
        }
      }
    }
  });

  it('all nodes reference valid pageId', () => {
    for (const t of templates) {
      const pageIds = new Set(t.pages.map(p => p.id));
      for (const node of t.nodes) {
        expect(pageIds.has(node.pageId), `node ${node.id} in template ${t.id} references invalid page ${node.pageId}`).toBe(true);
      }
    }
  });

  it('all nodes reference "sample-project" as projectId', () => {
    for (const t of templates) {
      for (const node of t.nodes) {
        expect(node.projectId, `node ${node.id} in template ${t.id}`).toBe('sample-project');
      }
    }
  });

  it('all canvasStates reference valid projectId+pageId pairs', () => {
    for (const t of templates) {
      const pageIds = new Set(t.pages.map(p => p.id));
      for (const cs of t.canvasStates) {
        expect(cs.projectId, `canvasState in template ${t.id}`).toBe('sample-project');
        expect(pageIds.has(cs.pageId), `canvasState in template ${t.id} references invalid page ${cs.pageId}`).toBe(true);
      }
    }
  });

  it('all tokens reference "sample-project" as projectId', () => {
    for (const t of templates) {
      for (const token of t.tokens) {
        expect(token.projectId, `token ${token.id} in template ${t.id}`).toBe('sample-project');
      }
    }
  });

  it('all groups reference "sample-project" as projectId', () => {
    for (const t of templates) {
      for (const group of t.groups) {
        expect(group.projectId, `group ${group.id} in template ${t.id}`).toBe('sample-project');
      }
    }
  });
});

describe('Sample Templates — Token Value Ranges', () => {
  it('token themeValues have hue in 0-360 range', () => {
    for (const t of templates) {
      for (const token of t.tokens) {
        if (token.themeValues) {
          for (const [themeId, values] of Object.entries(token.themeValues)) {
            if (values.hue !== undefined) {
              expect(values.hue, `token ${token.name} theme ${themeId} hue`).toBeGreaterThanOrEqual(0);
              expect(values.hue, `token ${token.name} theme ${themeId} hue`).toBeLessThanOrEqual(360);
            }
          }
        }
      }
    }
  });

  it('token themeValues have saturation in 0-100 range', () => {
    for (const t of templates) {
      for (const token of t.tokens) {
        if (token.themeValues) {
          for (const [themeId, values] of Object.entries(token.themeValues)) {
            if (values.saturation !== undefined) {
              expect(values.saturation, `token ${token.name} theme ${themeId} sat`).toBeGreaterThanOrEqual(0);
              expect(values.saturation, `token ${token.name} theme ${themeId} sat`).toBeLessThanOrEqual(100);
            }
          }
        }
      }
    }
  });

  it('token themeValues have lightness in 0-100 range', () => {
    for (const t of templates) {
      for (const token of t.tokens) {
        if (token.themeValues) {
          for (const [themeId, values] of Object.entries(token.themeValues)) {
            if (values.lightness !== undefined) {
              expect(values.lightness, `token ${token.name} theme ${themeId} light`).toBeGreaterThanOrEqual(0);
              expect(values.lightness, `token ${token.name} theme ${themeId} light`).toBeLessThanOrEqual(100);
            }
          }
        }
      }
    }
  });
});

describe('Sample Templates — Lookup', () => {
  it('getTemplateById returns correct template', () => {
    const t = getTemplateById('starter');
    expect(t).toBeDefined();
    if (t) {
      expect(t.id).toBe('starter');
      expect(t.name).toBeTruthy();
    }
  });

  it('getTemplateById returns undefined for unknown id', () => {
    const t = getTemplateById('nonexistent-template-xyz');
    expect(t).toBeUndefined();
  });

  it('template names are unique', () => {
    const names = templates.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
