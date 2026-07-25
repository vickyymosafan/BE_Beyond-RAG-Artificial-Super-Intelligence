import type { Context } from 'hono';

export function jsonSuccess<T = unknown>(c: Context, data: T, status: 200 | 201 = 200) {
  return c.json(data as Record<string, unknown>, status);
}

export function jsonError(c: Context, message: string, status: 400 | 401 | 403 | 404 | 500 = 500) {
  return c.json({ error: message }, status);
}
