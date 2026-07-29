import { neon } from '@neondatabase/serverless';
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

const sql = neon(process.env.DATABASE_URL);

async function run() {
  const rows = await sql`
    SELECT id, query, was_improved, provider_used, gap_score, original_score, improved_score, improvement_reason, created_at
    FROM agent_learning_log
    ORDER BY created_at DESC
    LIMIT 5
  `;
  console.log('=== NEON DB LEARNING LOGS ===');
  for (const r of rows) {
    console.log(`\nID: ${r.id} | Query: "${r.query.slice(0, 50)}..."`);
    console.log(`Was Improved: ${r.was_improved} | Provider: ${r.provider_used}`);
    console.log(`Gap Score: ${(r.gap_score * 100).toFixed(1)}% | Orig: ${r.original_score} -> Improved: ${r.improved_score}`);
    console.log(`Reason: ${r.improvement_reason?.slice(0, 100)}`);
  }
}

run().catch(console.error);
