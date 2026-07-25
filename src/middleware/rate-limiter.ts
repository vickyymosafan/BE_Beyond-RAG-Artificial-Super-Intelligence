import type { Context, Next } from 'hono';
import type { CloudflareBindings } from '../types';

export async function rateLimitMiddleware(
  c: Context<{ Bindings: CloudflareBindings }>,
  next: Next
): Promise<Response | void> {
  const userId = c.req.header('X-User-Id') || 'anonymous';
  const doId = c.env.RATE_LIMITER.idFromName(userId);
  const stub = c.env.RATE_LIMITER.get(doId);

  const res = await stub.fetch('http://internal/check');
  const { allowed } = await res.json() as { allowed: boolean; count: number };

  if (!allowed) {
    return c.json({
      error: 'Rate limit exceeded',
      message: 'Maksimal 20 request per menit. Silakan tunggu.',
      retryAfter: 60,
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
    const recent = history.filter(t => now - t < 60000);
    if (recent.length >= 20) {
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
    const limit = provider === 'gemini' ? 15 : provider === 'groq' ? 30 : 60;
    const now = Date.now();
    const history = (await this.state.storage.get<number[]>('history')) || [];
    const recent = history.filter(t => now - t < 60000);
    if (recent.length >= limit) {
      return new Response(JSON.stringify({ allowed: false, count: recent.length, limit }), { status: 429 });
    }
    recent.push(now);
    await this.state.storage.put('history', recent);
    return new Response(JSON.stringify({ allowed: true, count: recent.length, limit }), { status: 200 });
  }
}
