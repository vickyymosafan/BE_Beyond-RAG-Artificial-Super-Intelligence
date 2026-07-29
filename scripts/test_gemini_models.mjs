import fs from 'fs';

const devVars = fs.readFileSync('d:\\portfolio-project-2026\\rag-ai-agentic\\backend\\.dev.vars', 'utf8');
const geminiKey = devVars.match(/GEMINI_API_KEY=(.+)/)?.[1]?.trim();

console.log('Testing GEMINI_API_KEY:', geminiKey?.slice(0, 10) + '...');

async function testGeminiModel(modelName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;
  console.log(`\n--- Testing model: ${modelName} ---`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Hello, respond with 1 word' }] }],
        generationConfig: { maxOutputTokens: 100 },
      }),
    });
    console.log('Status:', res.status);
    const data = await res.json();
    if (res.ok) {
      console.log('Success! Text:', data.candidates?.[0]?.content?.parts?.[0]?.text);
    } else {
      console.log('Error:', data.error?.message);
    }
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
}

async function main() {
  await testGeminiModel('gemini-2.5-flash');
  await testGeminiModel('gemini-2.0-flash');
  await testGeminiModel('gemini-1.5-flash');
}

main().catch(console.error);
