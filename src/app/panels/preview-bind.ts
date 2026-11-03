// Guess which token feeds each preview slot from its name (bg/surface → surface…).
import type { PreviewSlot, TokenNode } from '@/engine/model';

const TEXTISH = /text|fg|foreground|content|ink/;
const ON_PRIMARY = /on[-_ ]?(primary|accent|brand|action)|(primary|accent|brand|action).*(on|fg|text|contrast)/;
const MUTED = /(muted|secondary|subtle|tertiary)/;
const BRANDISH = /primary|accent|brand|action|button/;

const RULES: { slot: PreviewSlot; test: (name: string) => boolean }[] = [
  { slot: 'on-primary', test: (n) => ON_PRIMARY.test(n) },
  { slot: 'text-muted', test: (n) => MUTED.test(n) && TEXTISH.test(n) },
  { slot: 'success', test: (n) => /success|positive|valid/.test(n) },
  { slot: 'warning', test: (n) => /warning|caution|attention/.test(n) },
  { slot: 'danger', test: (n) => /danger|error|critical|negative|destructive/.test(n) },
  { slot: 'border', test: (n) => /border|stroke|outline|divider|line/.test(n) },
  { slot: 'surface', test: (n) => /surface|card|panel|elevated|raised/.test(n) && !BRANDISH.test(n) },
  { slot: 'background', test: (n) => /(bg|background|canvas|page|base)/.test(n) && !BRANDISH.test(n) },
  { slot: 'primary', test: (n) => /primary|accent|brand|action/.test(n) && !TEXTISH.test(n) && !ON_PRIMARY.test(n) },
  { slot: 'text', test: (n) => TEXTISH.test(n) && !MUTED.test(n) && !ON_PRIMARY.test(n) },
  { slot: 'text-muted', test: (n) => MUTED.test(n) },
];

export function autoBind(tokens: TokenNode[]): Partial<Record<PreviewSlot, string>> {
  const result: Partial<Record<PreviewSlot, string>> = {};
  const used = new Set<string>();
  for (const { slot, test } of RULES) {
    if (result[slot]) continue;
    const matches = tokens.filter((t) => test(t.name.toLowerCase()));
    const pick = matches.find((t) => !used.has(t.id)) ?? matches[0];
    if (pick) {
      result[slot] = pick.id;
      used.add(pick.id);
    }
  }
  return result;
}

