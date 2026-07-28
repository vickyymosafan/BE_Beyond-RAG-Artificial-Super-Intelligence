import type { CloudflareBindings, QueryType, RewriterOutput, ChatMessageContext } from '../types';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export function shouldSkipRewrite(query: string, history?: ChatMessageContext[]): boolean {
  // If active conversation history exists, do NOT skip so follow-up intent is always resolved!
  if (history && history.length > 0) {
    return false;
  }

  const lower = query.toLowerCase().trim();
  const words = lower.split(/\s+/);

  // Fast-path for short, direct initial queries (<= 6 words)
  if (words.length <= 6) {
    return true;
  }

  return false;
}

export async function rewriteAndExpand(
  query: string,
  type: QueryType,
  env: CloudflareBindings,
  history?: ChatMessageContext[]
): Promise<RewriterOutput> {
  // Check fast-path bypass heuristic
  if (shouldSkipRewrite(query, history)) {
    return { rewritten: query, variants: [] };
  }

  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  let historyContext = '';
  if (history && history.length > 0) {
    historyContext = '\nRiwayat Percakapan Sebelumnya:\n' +
      history.slice(-4).map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n') + '\n';
  }

  const systemPrompt = `Anda adalah asisten retrieval untuk dokumen akademik universitas.
Tugas Anda: rewrite query user menjadi query formal yang optimal untuk pencarian, lalu buat 2 variasi semantic.

Aturan:
- Jika ada riwayat percakapan, gunakan konteks tersebut untuk melengkapi pertanyaan menggantung (misal: "dia dosen mana?" ➔ Sebutkan nama subjek dari riwayat).
- Gunakan istilah formal akademik Indonesia.
- TA = Tugas Akhir (skripsi), KP = Kerja Praktek, KKN = Kuliah Kerja Nyata.
- JANGAN mengubah singkatan: TA, KP, KKN tetap ditulis apa adanya.
- JANGAN PERNAH mengubah maksud/intent asli pertanyaan user.
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
        { role: 'user', content: `${historyContext}Query Baru: "${query}"\nTipe: ${type}\n\nOutput JSON.` },
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
