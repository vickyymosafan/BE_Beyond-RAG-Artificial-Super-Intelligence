import type { CloudflareBindings } from '../types';
import { GROQ_API_URL, GROQ_MODEL, LLM_TEMPERATURE_MED, LLM_MAX_TOKENS_DEFAULT, MAX_SUB_QUESTIONS } from '../constants';

export async function decomposeQuery(
  query: string,
  env: CloudflareBindings
): Promise<string[]> {
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
          content: `Anda adalah asisten yang memecah query akademik kompleks menjadi sub-questions independen.
Setiap sub-question harus bisa dijawab dari satu sumber dokumen.
Output JSON: { "subQuestions": ["Q1", "Q2", ...] }
Maksimal ${MAX_SUB_QUESTIONS} sub-questions.`,
        },
        {
          role: 'user',
          content: `Pecah query berikut menjadi sub-questions independen:\n\n"${query}"\n\nOutput JSON.`,
        },
      ],
      temperature: LLM_TEMPERATURE_MED,
      max_tokens: LLM_MAX_TOKENS_DEFAULT,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Groq Sub-Question error:', err);
    return [query];
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const output = JSON.parse(data.choices[0].message.content) as { subQuestions?: string[] };
  return output.subQuestions?.filter(Boolean) || [query];
}
