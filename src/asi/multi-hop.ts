import type { CloudflareBindings, RetrievalResult } from '../types';
import { adaptiveRetrieve } from './retrieval';
import { callWithFallback } from './router';
import { trackRPDCall } from '../utils/rpd-tracker';
import { GROQ_API_URL, GROQ_MODEL_VERSATILE, MIN_CONFIDENCE_SCORE, MAX_HOPS, LLM_TEMPERATURE_MED, LLM_MAX_TOKENS_SMALL } from '../constants';

export async function multiHopRetrieve(
  query: string,
  queryType: string,
  env: CloudflareBindings,
  docFilter?: string[]
): Promise<{ results: RetrievalResult[]; hops: string[] }> {
  const hops: string[] = [];
  let allResults: RetrievalResult[] = [];
  let currentQuery = query;
  let hopCount = 0;

  while (hopCount <= MAX_HOPS) {
    const results = await adaptiveRetrieve(currentQuery, queryType as any, env, docFilter);
    allResults = mergeAndDeduplicate([...allResults, ...results]).slice(0, 10);

    if (hopCount >= MAX_HOPS) break;

    if (!needsMoreInfo(allResults)) break;

    const nextQuery = await generateNextHopQuery(query, allResults, env);
    if (!nextQuery || nextQuery === query) break;

    hops.push(`Hop ${hopCount + 1}: "${nextQuery}"`);
    currentQuery = nextQuery;
    hopCount++;
  }

  return { results: allResults, hops };
}

function needsMoreInfo(results: RetrievalResult[]): boolean {
  if (results.length < 3) return true;

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  if (avgScore < MIN_CONFIDENCE_SCORE) return true;

  const topScore = results[0]?.score || 0;
  if (topScore < 0.6) return true;

  return false;
}

async function generateNextHopQuery(
  originalQuery: string,
  currentResults: RetrievalResult[],
  env: CloudflareBindings
): Promise<string | null> {
  const contextSummary = currentResults
    .slice(0, 3)
    .map(r => r.content?.slice(0, 200))
    .filter(Boolean)
    .join('\n---\n');

  if (!contextSummary) return null;

  const result = await callWithFallback(
    async () => {
      const res = await (await fetch(
        GROQ_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: GROQ_MODEL_VERSATILE,
            messages: [
              {
                role: 'system',
                content: `Anda adalah asisten multi-hop reasoning untuk dokumen akademik.
Hasil pencarian saat ini tidak cukup untuk menjawab query pengguna.
Buat SATU follow-up query untuk mencari informasi tambahan yang diperlukan.

Aturan:
- Follow-up query harus spesifik dan langsung
- Fokus pada informasi yang MASIH KURANG
- Gunakan istilah formal akademik
- Output: HANYA query follow-up, tanpa penjelasan`,
              },
              {
                role: 'user',
                content: `Query asli: "${originalQuery}"

Hasil pencarian saat ini:
${contextSummary}

Buat follow-up query untuk melengkapi informasi yang kurang:`,
              },
            ],
            temperature: LLM_TEMPERATURE_MED,
            max_tokens: LLM_MAX_TOKENS_SMALL,
          }),
        }
      ));
      await trackRPDCall('groq', env);
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      return (data.choices?.[0]?.message?.content || '').trim();
    },
    async () => null,
    'groq',
    8000
  );

  return result || null;
}

function mergeAndDeduplicate(results: RetrievalResult[]): RetrievalResult[] {
  const seen = new Set<string>();
  const merged: RetrievalResult[] = [];

  for (const r of results) {
    const key = r.chunkId || r.docId;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }

  return merged.sort((a, b) => b.score - a.score);
}
