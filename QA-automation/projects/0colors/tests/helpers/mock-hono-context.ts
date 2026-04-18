/**
 * Mock Hono context factory for backend route tests.
 */
import { vi } from 'vitest';

export interface MockContext {
  req: {
    header: (name: string) => string | undefined;
    json: ReturnType<typeof vi.fn>;
    param: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
}

export function mockContext(options: {
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
} = {}): MockContext {
  const { headers = {}, body, params = {}, query = {} } = options;

  const ctx: MockContext = {
    req: {
      header: (name: string) => headers[name] ?? headers[name.toLowerCase()],
      json: vi.fn().mockResolvedValue(body ?? {}),
      param: (name: string) => params[name],
      query: (name: string) => query[name],
    },
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };

  return ctx;
}
