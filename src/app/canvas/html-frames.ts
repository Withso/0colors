// Built-in HTML frames (the demo's visual tutorials / landing page). Pages live in
// public/tutorials/<doc>.html and are static — no scripts, no network. Anything
// interactive is a native button rendered by the frame, defined here.
import { toast } from 'sonner';
import { createBlankProject } from '@/engine/defaults';
import { slugify, uid } from '@/engine/model';
import { getEditor } from '../store';
import { useUI } from '../ui-store';
import { createCanvas } from '../persist';
import { focusNode } from '../inspector/common';

export type FrameCommand =
  | 'new-canvas' | 'copy-demo' | 'palette' | 'fit' | 'shortcuts' | 'toggle-theme'
  | `focus:${string}`;

export interface FrameAction { label: string; command: FrameCommand; primary?: boolean; shortcut?: string }

export interface FrameDoc {
  title: string;
  actions?: FrameAction[];
  /** Where the native buttons sit inside the frame. */
  actionsAt?: 'bottom-left' | 'bottom-right' | 'bottom-center';
}

export const HTML_FRAMES: Record<string, FrameDoc> = {
  welcome: {
    title: 'Welcome to 0colors',
    actionsAt: 'bottom-left',
    actions: [
      { label: 'Try the live colors', command: 'focus:Play color', primary: true },
      { label: 'Explore the tour', command: 'fit' },
      { label: 'Create a canvas', command: 'new-canvas' },
    ],
  },
  spaces: { title: 'Color spaces' },
  derive: { title: 'Inheritance and rules' },
  themes: { title: 'Tokens and themes' },
  logic: { title: 'Anatomy of a formula' },
  canvas: {
    title: 'Canvas basics',
    actionsAt: 'bottom-left',
    actions: [
      { label: 'Create a canvas', command: 'new-canvas', primary: true },
      { label: 'Back to start', command: 'focus:Start here' },
      { label: 'All shortcuts', command: 'shortcuts', shortcut: '?' },
    ],
  },
};

export const frameDoc = (doc: string): FrameDoc => HTML_FRAMES[doc] ?? { title: 'Tutorial' };
export const frameUrl = (doc: string) => `/tutorials/${doc}.html`;

export function runFrameCommand(command: FrameCommand) {
  if (command === 'new-canvas') { void createCanvas(createBlankProject()).then(() => toast.success('New blank canvas — the demo is always in the canvas menu')); return; }
  if (command === 'copy-demo') {
    const now = Date.now();
    const { project } = getEditor();
    void createCanvas({ ...structuredClone(project), id: uid('p_'), name: `${project.name} copy`, createdAt: now, updatedAt: now });
    return;
  }
  if (command === 'palette') { useUI.getState().openPalette('all'); return; }
  if (command === 'shortcuts') { useUI.getState().setShortcutsOpen(true); return; }
  if (command === 'fit') { window.dispatchEvent(new CustomEvent('0colors:canvas', { detail: { command: 'fit' } })); return; }
  if (command === 'toggle-theme') {
    const { project, themeId, setTheme } = getEditor();
    const i = project.themes.findIndex((t) => t.id === themeId);
    const next = project.themes[(i + 1) % project.themes.length];
    if (next) setTheme(next.id);
    return;
  }
  if (command.startsWith('focus:')) {
    const name = slugify(command.slice(6));
    const node = getEditor().project.nodes.find((n) => slugify(n.name) === name);
    if (node) focusNode(node.id);
  }
}
