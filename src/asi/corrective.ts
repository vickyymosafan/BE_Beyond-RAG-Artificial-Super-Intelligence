import type { CloudflareBindings, CorrectiveAction } from '../types';
import { GROQ_API_URL, GROQ_MODEL, LLM_TEMPERATURE_MED, LLM_MAX_TOKENS_MED } from '../constants';

export async function correctiveRAG(
  query: string,
  failedAttempt: { strategy: string; score: number; issues: string[] },
  env: CloudflareBindings
): Promise<CorrectiveAction> {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: `Anda adalah Corrective RAG analyzer. Tentukan strategi perbaikan berdasarkan analisis kegagalan.
Output JSON: { "strategy": "rewrite/hybrid/bm25_only/decompose", "adjusted_query": "..." }

Strategi:
- "konteks tidak relevan" → rewrite + ubah query
- "informasi kurang" → hybrid dengan top-K lebih besar
- "sumber tidak ditemukan" → bm25_only (keyword exact)
- "jawaban tidak lengkap" → decompose jadi sub-questions`,
        },
        {
          role: 'user',
          content: `Analisis kegagalan:

Query: "${query}"
Strategy sebelumnya: ${failedAttempt.strategy}
Score: ${failedAttempt.score}
Issues: ${failedAttempt.issues.join(', ')}

Tentukan strategy baru. Output JSON.`,
        },
      ],
      temperature: LLM_TEMPERATURE_MED,
      max_tokens: LLM_MAX_TOKENS_MED,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Groq Corrective error:', err);
    return { strategy: 'rewrite', adjusted_query: query };
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  try {
    const output = JSON.parse(data.choices[0].message.content) as CorrectiveAction;
    return {
      strategy: output.strategy || 'rewrite',
      adjusted_query: output.adjusted_query || query,
    };
  } catch {
    return { strategy: 'rewrite', adjusted_query: query };
  }
}
