import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { CloudflareBindings } from '../types';
import { adminAuth } from '../middleware/auth';
import {
  listDocuments,
  getDocument,
  createDocument,
  softDeleteDocument,
  getDocumentVersions,
  getPopularFAQ,
} from '../db/admin-queries';
import { getRecentLearnings, getLearningStats } from '../db/learning-queries';
import { getRPDStats } from '../utils/rpd-tracker';
import { getTopCachedQueries, clearAllCache } from '../asi/cache';
import { invalidateDocCache } from '../asi/cache-invalidation';
import { ingestDocument } from '../ingestion';

const adminRouter = new Hono<{ Bindings: CloudflareBindings }>();

// Unauthenticated Admin endpoints
adminRouter.post('/login', zValidator('json', z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})), async (c) => {
  const { username, password } = c.req.valid('json');
  if (username !== 'admin' || password !== 'admin123') {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: 'admin', role: 'admin', iat: now, exp: now + 86400 };

  const h = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const p = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const secret = c.env.JWT_SECRET || 'dev-secret-change-in-production';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${h}.${p}`));
  const s = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return c.json({ token: `${h}.${p}.${s}`, expiresAt: (now + 86400) * 1000 });
});

// Cache clearing endpoint (accessible for maintenance)
adminRouter.post('/cache/clear', async (c) => {
  const deleted = await clearAllCache(c.env);
  return c.json({ success: true, deleted });
});

// Authenticated Admin routes middleware
adminRouter.use('*', adminAuth);

// Document Management
adminRouter.get('/documents', async (c) => {
  const docs = await listDocuments(c.env);
  return c.json({ documents: docs });
});

adminRouter.get('/documents/:id', async (c) => {
  const doc = await getDocument(c.req.param('id'), c.env);
  if (!doc) return c.json({ error: 'Document not found' }, 404);
  return c.json({ document: doc });
});

adminRouter.post('/documents', zValidator('json', z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  filename: z.string().min(1),
  type: z.string().min(1),
})), async (c) => {
  const { id, title, filename, type } = c.req.valid('json');
  await createDocument({ id, title, filename, type }, c.env);
  return c.json({ success: true, id }, 201);
});

adminRouter.delete('/documents/:id', async (c) => {
  const docId = c.req.param('id');
  await invalidateDocCache(docId, c.env);
  await softDeleteDocument(docId, c.env);
  return c.json({ success: true });
});

adminRouter.get('/documents/:id/versions', async (c) => {
  const versions = await getDocumentVersions(c.req.param('id'), c.env);
  return c.json({ versions });
});

adminRouter.post('/documents/upload', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'] as File | undefined;
  const docId = body['docId'] as string | undefined;
  const title = body['title'] as string | undefined;

  if (!file || !docId || !title) {
    return c.json({ error: 'Missing required fields: file, docId, title' }, 400);
  }

  if (!file.name.endsWith('.pdf') && !file.name.endsWith('.docx')) {
    return c.json({ error: 'Only PDF and DOCX files are supported' }, 400);
  }

  try {
    const result = await ingestDocument(file, docId, title, 'admin', c.env);
    return c.json({ success: true, ...result }, 201);
  } catch (err) {
    return c.json({ error: `Ingestion failed: ${err instanceof Error ? err.message : 'Unknown'}` }, 500);
  }
});

// Stats & Analytics
adminRouter.get('/stats/rpd', async (c) => {
  const days = parseInt(c.req.query('days') || '7', 10);
  const stats = await getRPDStats(c.env, Math.min(days, 30));
  return c.json({ stats });
});

adminRouter.get('/cache/top', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10', 10);
  const top = await getTopCachedQueries(c.env, Math.min(limit, 50));
  return c.json({ queries: top });
});

adminRouter.get('/faq', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10', 10);
  const faq = await getPopularFAQ(c.env, Math.min(limit, 50));
  return c.json({ faq });
});

adminRouter.get('/stats/learning', async (c) => {
  const stats = await getLearningStats(c.env);
  return c.json({ stats });
});

adminRouter.get('/learning-logs', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const logs = await getRecentLearnings(Math.min(limit, 100), c.env);
  return c.json({ logs });
});

export default adminRouter;
