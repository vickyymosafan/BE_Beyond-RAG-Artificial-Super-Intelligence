import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { CloudflareBindings } from './types';
import { RateLimiterDO } from './middleware/rate-limiter';
import { ProviderRateLimiterDO } from './middleware/rate-limiter';
import { rateLimitMiddleware } from './middleware/rate-limiter';
import ragRouter from './routes/rag';
import adminRouter from './routes/admin';

export { RateLimiterDO, ProviderRateLimiterDO };

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Global Middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

app.use('/api/*', rateLimitMiddleware);

// Health Check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Mount Modular Sub-Routers
app.route('/api/rag', ragRouter);
app.route('/api/admin', adminRouter);

export default app;