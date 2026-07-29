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
    SELECT id, page_number, content
    FROM chunks
    WHERE content ILIKE '%rumus%'
       OR content ILIKE '%formula%'
       OR content ILIKE '%persamaan%'
  `;
  console.log(`Found ${rows.length} matching chunks for Rumus/Formula/Persamaan:`);
  for (const r of rows) {
    console.log(`\n=== PAGE ${r.page_number} | ID ${r.id} ===`);
    console.log(r.content);
  }
}

run().catch(console.error);
