import type { Page } from '@playwright/test';

export function modKey(): 'Meta' | 'Control' {
  return process.platform === 'darwin' ? 'Meta' : 'Control';
}

export async function pressChord(
  page: Page,
  key: 'KeyK' | 'KeyZ' | 'KeyD',
  options?: { shift?: boolean },
): Promise<void> {
  const mod = modKey();
  if (options?.shift) {
    await page.keyboard.press(`${mod}+Shift+${key}`);
  } else {
    await page.keyboard.press(`${mod}+${key}`);
  }
}
