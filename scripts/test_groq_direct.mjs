import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadDevVars(filePath) {
  try {
    const content = readFileSync(resolve(filePath), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}

loadDevVars('.dev.vars');
loadDevVars('backend/.dev.vars');

const apiKey = process.env.GROQ_API_KEY;
console.log('GROQ_API_KEY present:', !!apiKey, apiKey?.slice(0, 8));

async function testGroq() {
  const systemPrompt = `Anda adalah AI self-improvement agent. Perbaiki jawaban agar lebih lengkap.`;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Test query' },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });

  console.log('Groq status:', res.status, res.statusText);
  const text = await res.text();
  console.log('Groq response:', text.slice(0, 300));
}

testGroq().catch(console.error);
