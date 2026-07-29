import type { Context, Next } from 'hono';
import type { CloudflareBindings } from '../types';
import { RATE_LIMIT_USER_RPM, RATE_LIMIT_WINDOW_MS, ERROR_RATE_LIMIT, PROVIDER_RPM_LIMITS } from '../constants';

export async function rateLimitMiddleware(
  c: Context<{ Bindings: CloudflareBindings }>,
  next: Next
): Promise<Response | void> {
  // Exempt admin endpoints & OPTIONS preflight from IP rate limits
  if (c.req.path.startsWith('/api/admin') || c.req.method === 'OPTIONS') {
    return await next();
  }

  const userId = c.req.header('X-User-Id') || 'anonymous';
  const doId = c.env.RATE_LIMITER.idFromName(userId);
  const stub = c.env.RATE_LIMITER.get(doId);

  const res = await stub.fetch('http://internal/check');
  const { allowed } = await res.json() as { allowed: boolean; count: number };

  if (!allowed) {
    return c.json({
      error: 'Rate limit exceeded',
      message: ERROR_RATE_LIMIT,
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    }, 429);
  }

  await next();
}

export async function checkProviderRateLimit(
  provider: string,
  env: CloudflareBindings
): Promise<{ allowed: boolean; remaining: number }> {
  const doId = env.PROVIDER_RATE_LIMITER.idFromName(provider);
  const stub = env.PROVIDER_RATE_LIMITER.get(doId);

  const res = await stub.fetch(`http://internal/check?provider=${provider}`);
  const data = await res.json() as { allowed: boolean; count: number; limit: number };
  return { allowed: data.allowed, remaining: Math.max(0, data.limit - data.count) };
}

export class RateLimiterDO {
  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }
  async fetch(req: Request) {
    const now = Date.now();
    const history = (await this.state.storage.get<number[]>('history')) || [];
    const recent = history.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_USER_RPM) {
      return new Response(JSON.stringify({ allowed: false, count: recent.length }), { status: 429 });
    }
    recent.push(now);
    await this.state.storage.put('history', recent);
    return new Response(JSON.stringify({ allowed: true, count: recent.length }), { status: 200 });
  }
}

export class ProviderRateLimiterDO {
  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }
  async fetch(req: Request) {
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider') || 'default';
    const limit = PROVIDER_RPM_LIMITS[provider] || 60;
    const now = Date.now();
    const history = (await this.state.storage.get<number[]>('history')) || [];
    const recent = history.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= limit) {
      return new Response(JSON.stringify({ allowed: false, count: recent.length, limit }), { status: 429 });
    }
    recent.push(now);
    await this.state.storage.put('history', recent);
    return new Response(JSON.stringify({ allowed: true, count: recent.length, limit }), { status: 200 });
  }
}
