import type { CloudflareBindings } from '../types';
import { GEMINI_EMBED_URL, GEMINI_BATCH_EMBED_URL, WORKERS_AI_URL, EMBEDDING_DIMENSION, EMBEDDING_BATCH_SIZE, GEMINI_EMBEDDING_MODEL } from '../constants';

export async function embedQuery(
  query: string,
  env: CloudflareBindings
): Promise<number[]> {
  try {
    return await embedGemini(query, env);
  } catch (err) {
    console.warn('Gemini embedding failed, falling back to Workers AI:', err);
  }
  try {
    return await embedWorkersAI(query, env);
  } catch (err) {
    console.warn('Workers AI embedding failed, using zero-vector fallback:', err);
  }
  return new Array(EMBEDDING_DIMENSION).fill(0);
}

export async function batchEmbedQueries(
  queries: string[],
  env: CloudflareBindings
): Promise<number[][]> {
  if (queries.length === 0) return [];
  // ─── [SEC-2 FIX] Always use GEMINI_API_KEY for Gemini REST API calls.
  // CLOUDFLARE_API_TOKEN is a different credential and must NOT be sent to Google APIs.
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const BATCH_SIZE = EMBEDDING_BATCH_SIZE;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const chunkBatch = queries.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${GEMINI_BATCH_EMBED_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: chunkBatch.map(text => ({
          model: GEMINI_EMBEDDING_MODEL,
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIMENSION,
        })),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Gemini batch embedding error (sub-batch ${i}):`, err);
      throw new Error(`Batch embedding failed: ${res.status}`);
    }

    const data = await res.json() as { embeddings: { values: number[] }[] };
    if (!data.embeddings || !Array.isArray(data.embeddings)) {
      throw new Error(`Unexpected batch response: ${JSON.stringify(data).slice(0, 200)}`);
    }
    allEmbeddings.push(...data.embeddings.map(e => e.values));
  }

  return allEmbeddings;
}

async function embedGemini(query: string, env: CloudflareBindings): Promise<number[]> {
  // ─── [SEC-2 FIX] Use only GEMINI_API_KEY — never CLOUDFLARE_API_TOKEN for Gemini.
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const res = await fetch(`${GEMINI_EMBED_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GEMINI_EMBEDDING_MODEL,
      content: { parts: [{ text: query }] },
      outputDimensionality: EMBEDDING_DIMENSION,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Gemini Embedding error:', err);
    throw new Error(`Embedding failed: ${res.status}`);
  }

  const data = await res.json() as { embedding: { values: number[] } };
  return data.embedding.values;
}

async function embedWorkersAI(query: string, env: CloudflareBindings): Promise<number[]> {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID not configured');

  // ─── [SEC-2 FIX] Workers AI correctly uses CLOUDFLARE_API_TOKEN for Bearer auth.
  const cfToken = env.CLOUDFLARE_API_TOKEN;
  if (!cfToken) throw new Error('CLOUDFLARE_API_TOKEN not configured for Workers AI');

  const res = await fetch(WORKERS_AI_URL.replace('{account_id}', accountId), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: query }),
  });

  if (!res.ok) throw new Error(`Workers AI embedding failed: ${res.status}`);
  const data = await res.json() as { result?: { data?: number[] } };
  return data.result?.data || [];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
