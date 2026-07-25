const BACKEND = 'https://rag-ai-agentic.mvickymosafan.workers.dev';

async function main() {
  console.log('Logging in...');
  const loginRes = await fetch(`${BACKEND}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await loginRes.json();

  console.log('Calling /api/admin/cache/clear...');
  const clearRes = await fetch(`${BACKEND}/api/admin/cache/clear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await clearRes.json();
  console.log('Clear cache status:', clearRes.status, 'Response:', data);
}

main().catch(console.error);
