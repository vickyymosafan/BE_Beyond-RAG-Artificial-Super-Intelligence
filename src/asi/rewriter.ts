import type { CloudflareBindings, QueryType, RewriterOutput } from '../types';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function rewriteAndExpand(
  query: string,
  type: QueryType,
  env: CloudflareBindings
): Promise<RewriterOutput> {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const systemPrompt = `Anda adalah asisten retrieval untuk dokumen akademik universitas.
Tugas Anda: rewrite query user menjadi query formal yang optimal untuk pencarian, lalu buat 2 variasi semantic.

Aturan:
- Gunakan istilah formal akademik Indonesia
- TA = Tugas Akhir (skripsi), KP = Kerja Praktek, KKN = Kuliah Kerja Nyata
- JANGAN mengubah singkatan: TA, KP, KKN tetap ditulis apa adanya
- JANGAN mengubah intent asli
- Output JSON: { "rewritten": "query formal", "variants": ["variasi1", "variasi2"] }`;

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Query: "${query}"\nTipe: ${type}\n\nOutput JSON.` },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Groq Rewriter error:', err);
    throw new Error(`Rewriter failed: ${res.status}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  try {
    const output = JSON.parse(data.choices[0].message.content) as RewriterOutput;
    return {
      rewritten: output.rewritten || query,
      variants: Array.isArray(output.variants) ? output.variants.slice(0, 2) : [],
    };
  } catch {
    return { rewritten: query, variants: [] };
  }
}
