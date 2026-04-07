import { http, HttpResponse } from 'msw';

/**
 * Shared MSW handlers for component/integration/browser-adjacent test setups.
 * Keep this intentionally tiny and add handlers only when a test truly needs
 * deterministic mocked network behavior.
 */
export const handlers = [
  http.get('/__msw__/health', () => HttpResponse.json({ ok: true })),
];
