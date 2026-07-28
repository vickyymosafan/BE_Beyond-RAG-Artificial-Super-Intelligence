import type { CloudflareBindings, CriticResult } from '../types';
import { GROQ_API_URL, GROQ_MODEL, LLM_TEMPERATURE_LOW, LLM_MAX_TOKENS_DEFAULT, CRITIC_PASS_THRESHOLD, CRITIC_FALLBACK_SCORE } from '../constants';

export async function selfCritic(
  query: string,
  answer: string,
  context: string,
  env: CloudflareBindings
): Promise<CriticResult> {
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
          content: `Anda adalah evaluator jawaban RAG. Evaluasi ketat berdasarkan konteks.
Output JSON: { "score": 0.0-1.0, "issues": ["..."], "verdict": "pass/retry/abstain" }

Kriteria:
- score = rata-rata dari: (1) Apakah setiap klaim didukung konteks? (2) Apakah sumber dicantumkan? (3) Apakah tidak ada halusinasi? (4) Apakah abstain jika tidak ditemukan?
- verdict "abstain" jika score < 0.4
- verdict "retry" jika 0.4-0.7
- verdict "pass" jika > 0.7`,
        },
        {
          role: 'user',
          content: `Evaluasi jawaban berikut:

--- QUERY ---
${query.slice(0, 500)}

--- KONTEKS ---
${context.slice(0, 2000)}

--- JAWABAN ---
${answer.slice(0, 2000)}

Output JSON.`,
        },
      ],
      temperature: LLM_TEMPERATURE_LOW,
      max_tokens: LLM_MAX_TOKENS_DEFAULT,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Groq Critic error:', err);
    return { score: CRITIC_FALLBACK_SCORE, issues: ['Critic service unavailable'], verdict: 'retry' };
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  try {
    const output = JSON.parse(data.choices[0].message.content) as CriticResult;
    const score = Math.max(0, Math.min(1, output.score || CRITIC_FALLBACK_SCORE));
    let verdict: 'pass' | 'retry' | 'abstain';
    if (score < 0.4) verdict = 'abstain';
    else if (score > CRITIC_PASS_THRESHOLD) verdict = 'pass';
    else verdict = 'retry';
    return { score, issues: output.issues || [], verdict };
  } catch {
    return { score: CRITIC_FALLBACK_SCORE, issues: ['Failed to parse critic output'], verdict: 'retry' };
  }
}
