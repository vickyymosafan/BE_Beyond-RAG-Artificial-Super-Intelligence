import type { CloudflareBindings, CacheEntry } from '../types';
import { embedQuery, cosineSimilarity } from '../utils/embedding';
import { hashQuery } from '../utils/hash';
import { CACHE_TTL_EXACT, CACHE_TTL_SEMANTIC, CACHE_TTL_MAX, CACHE_TTL_STATS, CACHE_TTL_NEGATIVE, SEMANTIC_THRESHOLD, ERROR_PREFIX } from '../constants';

export async function getFromCache(
  query: string,
  env: CloudflareBindings
): Promise<CacheEntry | null> {
  const queryHash = await hashQuery(query);

  const exact = await env.KV_CACHE.get<CacheEntry>(`search:${queryHash}`, 'json');
  if (exact && exact.response && !exact.response.includes(ERROR_PREFIX)) {
    if (hasResponseConceptMismatch(query, exact.response)) {
      console.log(`[Cache] Rejecting mismatched exact cache entry for query: "${query}"`);
    } else {
      exact.hitCount++;
      await updatePopAndTTL(exact, env, `search:${queryHash}`);
      await trackCacheHit(env, 'exact');
      return exact;
    }
  }

  const queryEmb = await embedQuery(query, env);
  const cacheKeys = await env.KV_CACHE.list({ prefix: 'semantic:' });

  let bestMatch: CacheEntry | null = null;
  let bestScore = 0;

  for (const key of cacheKeys.keys) {
    const entry = await env.KV_CACHE.get<CacheEntry>(key.name, 'json');
    if (!entry || !entry.response || entry.response.includes(ERROR_PREFIX)) continue;

    const similarity = cosineSimilarity(queryEmb, entry.queryEmbedding);
    if (similarity > SEMANTIC_THRESHOLD && similarity > bestScore) {
      if (hasConceptConflict(query, entry.query)) continue;
      if (hasResponseConceptMismatch(query, entry.response)) continue;
      bestScore = similarity;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    bestMatch.hitCount++;
    await updatePopAndTTL(bestMatch, env, `semantic:${queryHash}`);
    await trackCacheHit(env, 'semantic');
  } else {
    await trackCacheHit(env, 'miss');
  }

  return bestMatch;
}

export async function setCache(
  query: string,
  entry: CacheEntry,
  env: CloudflareBindings
): Promise<void> {
  const queryHash = await hashQuery(query);

  await env.KV_CACHE.put(`search:${queryHash}`, JSON.stringify(entry), {
    expirationTtl: CACHE_TTL_EXACT,
  });

  await env.KV_CACHE.put(`semantic:${queryHash}`, JSON.stringify(entry), {
    expirationTtl: CACHE_TTL_SEMANTIC,
  });

  await env.KV_CACHE.put(
    `meta:popular:${queryHash}`,
    JSON.stringify({ query, hitCount: 0, firstCached: Date.now() }),
    { expirationTtl: CACHE_TTL_SEMANTIC }
  );
}

export async function getTopCachedQueries(
  env: CloudflareBindings,
  limit: number = 10
): Promise<Array<{ query: string; hitCount: number }>> {
  const keys = await env.KV_CACHE.list({ prefix: 'meta:popular:' });
  const entries: Array<{ query: string; hitCount: number }> = [];

  for (const key of keys.keys) {
    const meta = await env.KV_CACHE.get<{ query: string; hitCount: number }>(key.name, 'json');
    if (meta) entries.push(meta);
  }

  return entries.sort((a, b) => b.hitCount - a.hitCount).slice(0, limit);
}

async function updatePopAndTTL(
  entry: CacheEntry,
  env: CloudflareBindings,
  key: string
): Promise<void> {
  const ttl = Math.min(CACHE_TTL_EXACT * entry.hitCount, CACHE_TTL_MAX);
  await env.KV_CACHE.put(key, JSON.stringify(entry), { expirationTtl: ttl });

  const popKey = key.replace(/^(search|semantic):/, 'meta:popular:');
  const meta = await env.KV_CACHE.get<{ query: string; hitCount: number; firstCached: number }>(popKey, 'json');
  if (meta) {
    meta.hitCount = entry.hitCount;
    await env.KV_CACHE.put(popKey, JSON.stringify(meta), { expirationTtl: CACHE_TTL_MAX });
  }
}

async function trackCacheHit(
  env: CloudflareBindings,
  type: 'exact' | 'semantic' | 'miss'
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `stats:cache:${today}:${type}`;
  const count = await env.KV_CACHE.get<number>(key, 'json');
  await env.KV_CACHE.put(key, JSON.stringify((count || 0) + 1), { expirationTtl: CACHE_TTL_STATS });
}

export async function clearAllCache(env: CloudflareBindings): Promise<number> {
  const keys = await env.KV_CACHE.list();
  let deleted = 0;
  for (const k of keys.keys) {
    await env.KV_CACHE.delete(k.name);
    deleted++;
  }
  return deleted;
}

export async function trackNegativePattern(query: string, env: CloudflareBindings): Promise<void> {
  const queryHash = await hashQuery(query);
  await env.KV_CACHE.put(`negative:${queryHash}`, JSON.stringify({ query, timestamp: Date.now() }), {
    expirationTtl: CACHE_TTL_NEGATIVE,
  });
}

export async function isNegativePattern(query: string, env: CloudflareBindings): Promise<boolean> {
  const queryHash = await hashQuery(query);
  const pattern = await env.KV_CACHE.get(`negative:${queryHash}`);
  return !!pattern;
}

function hasConceptConflict(q1: string, q2: string): boolean {
  const l1 = q1.toLowerCase();
  const l2 = q2.toLowerCase();

  const strictPairs: [string, string][] = [
    ['proposal', 'laporan'],
    ['pembimbing 1', 'pembimbing 2'],
    ['pembimbing i', 'pembimbing ii'],
    ['skripsi', 'kkn'],
    ['kp', 'ta'],
    ['gambar', 'tabel'],
    ['kutipan', 'daftar pustaka'],
    ['tabel 5.5', 'tabel 5.6'],
    ['sub-bab 5.2', 'sub-bab 5.3'],
  ];

  for (const [a, b] of strictPairs) {
    if ((l1.includes(a) && l2.includes(b)) || (l1.includes(b) && l2.includes(a))) {
      return true;
    }
  }
  return false;
}

function hasResponseConceptMismatch(query: string, response: string): boolean {
  const q = query.toLowerCase();
  const r = response.toLowerCase();

  // Jika query minta TABEL tapi respon menyajikan GAMBAR
  if ((q.includes('tabel') || q.includes('table')) && !q.includes('gambar')) {
    if (r.includes('aturan penyajian gambar') || r.includes('penyajian gambar pada proposal')) {
      return true;
    }
  }

  // Jika query minta GAMBAR tapi respon menyajikan TABEL
  if ((q.includes('gambar') || q.includes('image')) && !q.includes('tabel')) {
    if (r.includes('aturan penyajian tabel') || r.includes('penyajian tabel pada proposal')) {
      return true;
    }
  }

  // Jika query minta PROPOSAL tapi respon menyajikan LAPORAN TUGAS AKHIR 20 poin
  if (q.includes('proposal') && !q.includes('laporan')) {
    if (r.includes('sistematika penulisan laporan tugas akhir') || r.includes('tabel 5.6')) {
      return true;
    }
  }

  // Jika query minta LAPORAN tapi respon menyajikan PROPOSAL TUGAS AKHIR 9 poin
  if (q.includes('laporan') && !q.includes('proposal')) {
    if (r.includes('sistematika penulisan proposal tugas akhir') || r.includes('tabel 5.5')) {
      return true;
    }
  }

  return false;
}
