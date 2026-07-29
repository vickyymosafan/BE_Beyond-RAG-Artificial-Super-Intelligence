/**
 * Test Script: Verifikasi Self-Improvement Agent
 *
 * Usage: node backend/scripts/test_self_improver.mjs
 *
 * Test ini:
 * 1. Cek apakah tabel agent_learning_log ada di Neon DB
 * 2. Cek isi learning log terbaru
 * 3. Tampilkan statistik improvement rate
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Manual .dev.vars reader (no dotenv needed)
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
  } catch {
    // Silently skip if file not found
  }
}

loadDevVars('backend/.dev.vars');
loadDevVars('.dev.vars');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found. Set it in backend/.dev.vars');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function main() {
  console.log('🤖 Testing Self-Improvement Agent (Agent ke-2)\n');
  console.log('='.repeat(60));

  // 1. Cek apakah tabel ada
  console.log('\n📊 Step 1: Verifying agent_learning_log table...');
  const tableCheck = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_learning_log'
  `;
  if (tableCheck.length > 0) {
    console.log('✅ Table agent_learning_log EXISTS');
  } else {
    console.error('❌ Table agent_learning_log NOT FOUND');
    process.exit(1);
  }

  // 2. Lihat statistik keseluruhan
  console.log('\n📈 Step 2: Learning statistics...');
  const stats = await sql`
    SELECT
      COUNT(*)::int AS total_logs,
      SUM(CASE WHEN was_improved THEN 1 ELSE 0 END)::int AS total_improved,
      AVG(gap_score)::float AS avg_gap_score,
      AVG(original_score)::float AS avg_original_score,
      AVG(improved_score)::float AS avg_improved_score
    FROM agent_learning_log
  `;
  const s = stats[0];
  console.log(`  Total learning cycles  : ${s.total_logs}`);
  console.log(`  Improvements made      : ${s.total_improved}`);
  console.log(`  Improvement rate       : ${s.total_logs > 0 ? ((s.total_improved / s.total_logs) * 100).toFixed(1) : 0}%`);
  console.log(`  Avg gap score          : ${(s.avg_gap_score * 100)?.toFixed(1) ?? 'N/A'}%`);
  console.log(`  Avg original score     : ${s.avg_original_score?.toFixed(3) ?? 'N/A'}`);
  console.log(`  Avg improved score     : ${s.avg_improved_score?.toFixed(3) ?? 'N/A'}`);

  // 3. Lihat 5 learning terbaru
  console.log('\n📝 Step 3: Recent learning logs (last 5)...');
  const recent = await sql`
    SELECT
      id,
      LEFT(query, 60) AS query_short,
      was_improved,
      ROUND(gap_score::numeric * 100, 1) AS gap_pct,
      ROUND(original_score::numeric, 3) AS orig_score,
      ROUND(COALESCE(improved_score, 0)::numeric, 3) AS impr_score,
      provider_used,
      LEFT(improvement_reason, 80) AS reason,
      created_at
    FROM agent_learning_log
    ORDER BY created_at DESC
    LIMIT 5
  `;

  if (recent.length === 0) {
    console.log('  (No learning logs yet — send a query to the API to trigger Agent ke-2)');
  } else {
    for (const r of recent) {
      const status = r.was_improved ? '✅ IMPROVED' : '⭕ VERIFIED';
      console.log(`\n  [${r.id}] ${status}`);
      console.log(`    Query    : "${r.query_short}..."`);
      console.log(`    Gap      : ${r.gap_pct}%`);
      console.log(`    Scores   : ${r.orig_score} → ${r.impr_score}`);
      console.log(`    Provider : ${r.provider_used}`);
      console.log(`    Reason   : ${r.reason}`);
      console.log(`    Time     : ${r.created_at}`);
    }
  }

  // 4. Tampilkan skema tabel
  console.log('\n🗄️  Step 4: Table schema...');
  const schema = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'agent_learning_log' AND table_schema = 'public'
    ORDER BY ordinal_position
  `;
  console.log('  Columns:');
  for (const col of schema) {
    console.log(`    - ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} nullable:${col.is_nullable}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Self-Improvement Agent verification complete!');
  console.log('\nNext: Send a query to the RAG API and check if new entries appear.');
  console.log('The agent runs automatically in the background — no action needed.\n');
}

main().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

