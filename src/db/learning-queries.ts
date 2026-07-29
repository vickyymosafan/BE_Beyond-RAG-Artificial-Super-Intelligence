import { neon } from '@neondatabase/serverless';
import type { CloudflareBindings, LearningLogEntry } from '../types';

/**
 * Simpan satu siklus learning ke Neon DB.
 * Dipanggil oleh Self-Improvement Agent setiap kali verifikasi selesai.
 */
export async function insertLearningLog(
  entry: LearningLogEntry,
  env: CloudflareBindings
): Promise<void> {
  try {
    const sql = neon(env.DATABASE_URL);
    await sql`
      INSERT INTO agent_learning_log (
        query, original_answer, improved_answer,
        gap_score, gaps_found, missing_keywords,
        was_improved, improvement_reason, provider_used,
        original_score, improved_score
      ) VALUES (
        ${entry.query},
        ${entry.originalAnswer},
        ${entry.improvedAnswer ?? null},
        ${entry.gapScore},
        ${entry.gapsFound},
        ${entry.missingKeywords},
        ${entry.wasImproved},
        ${entry.improvementReason ?? null},
        ${entry.providerUsed ?? 'unknown'},
        ${entry.originalScore},
        ${entry.improvedScore ?? null}
      )
    `;
  } catch (err) {
    // Non-blocking: log error tapi jangan throw — agar background task tidak crash
    console.error('[SelfImprover] Failed to insert learning log:', err);
  }
}

/**
 * Buat entri awal dengan status 'in-progress' saat Agent-2 mulai bekerja.
 */
export async function createInitialLearningLog(
  query: string,
  originalAnswer: string,
  originalScore: number,
  env: CloudflareBindings
): Promise<number | null> {
  try {
    const sql = neon(env.DATABASE_URL);
    const rows = await sql`
      INSERT INTO agent_learning_log (
        query, original_answer, gap_score, gaps_found, missing_keywords,
        was_improved, improvement_reason, provider_used, original_score
      ) VALUES (
        ${query},
        ${originalAnswer},
        0.0,
        [],
        [],
        FALSE,
        'Agent-2 sedang menganalisis gap & konteks dokumen di Neon DB...',
        'in-progress',
        ${originalScore ?? 0.8}
      )
      RETURNING id
    ` as Array<{ id: number }>;

    return rows?.[0]?.id ?? null;
  } catch (err) {
    console.error('[SelfImprover] Failed to create initial in-progress log:', err);
    return null;
  }
}

/**
 * Update entri log setelah Agent-2 selesai menganalisis & meng-generate perbaikan.
 */
export async function updateLearningLog(
  id: number,
  entry: Partial<LearningLogEntry>,
  env: CloudflareBindings
): Promise<void> {
  try {
    const sql = neon(env.DATABASE_URL);
    await sql`
      UPDATE agent_learning_log
      SET improved_answer = ${entry.improvedAnswer ?? null},
          gap_score = ${entry.gapScore ?? 0},
          gaps_found = ${entry.gapsFound ?? []},
          missing_keywords = ${entry.missingKeywords ?? []},
          was_improved = ${entry.wasImproved ?? false},
          improvement_reason = ${entry.improvementReason ?? null},
          provider_used = ${entry.providerUsed ?? 'completed'},
          improved_score = ${entry.improvedScore ?? null}
      WHERE id = ${id}
    `;
  } catch (err) {
    console.error('[SelfImprover] Failed to update learning log:', err);
  }
}

/**
 * Ambil learning log terbaru (untuk audit dan monitoring admin).
 */
export async function getRecentLearnings(
  limit: number,
  env: CloudflareBindings
): Promise<LearningLogEntry[]> {
  try {
    const sql = neon(env.DATABASE_URL);
    const rows = await sql`
      SELECT id, query, original_answer, improved_answer, gap_score,
             gaps_found, missing_keywords, was_improved,
             improvement_reason, provider_used, original_score, improved_score,
             created_at
      FROM agent_learning_log
      ORDER BY created_at DESC
      LIMIT ${limit}
    ` as Array<{
      id: number; query: string; original_answer: string; improved_answer: string | null;
      gap_score: number; gaps_found: string[]; missing_keywords: string[];
      was_improved: boolean; improvement_reason: string | null;
      provider_used: string; original_score: number; improved_score: number | null;
      created_at: Date;
    }>;

    return rows.map(r => ({
      id: r.id,
      query: r.query,
      originalAnswer: r.original_answer,
      improvedAnswer: r.improved_answer ?? undefined,
      gapScore: r.gap_score,
      gapsFound: r.gaps_found ?? [],
      missingKeywords: r.missing_keywords ?? [],
      wasImproved: r.was_improved,
      improvementReason: r.improvement_reason ?? undefined,
      providerUsed: r.provider_used,
      originalScore: r.original_score,
      improvedScore: r.improved_score ?? undefined,
      createdAt: r.created_at.toISOString(),
    }));
  } catch (err) {
    console.error('[SelfImprover] Failed to get recent learnings:', err);
    return [];
  }
}

/**
 * Cari learning yang pernah dilakukan untuk query serupa.
 * Skip re-improvement jika query ini sudah pernah diperbaiki sebelumnya.
 */
export async function getSimilarLearning(
  query: string,
  env: CloudflareBindings
): Promise<LearningLogEntry | null> {
  try {
    const sql = neon(env.DATABASE_URL);
    const keywords = query
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 5);

    if (keywords.length === 0) return null;

    const searchPattern = keywords.join(' & ');
    let rows = await sql`
      SELECT query, original_answer, improved_answer, gap_score,
             gaps_found, missing_keywords, was_improved,
             improvement_reason, provider_used, original_score, improved_score
      FROM agent_learning_log
      WHERE to_tsvector('simple', query) @@ to_tsquery('simple', ${searchPattern})
        AND was_improved = TRUE
      ORDER BY created_at DESC
      LIMIT 1
    ` as Array<{
      query: string; original_answer: string; improved_answer: string | null;
      gap_score: number; gaps_found: string[]; missing_keywords: string[];
      was_improved: boolean; improvement_reason: string | null;
      provider_used: string; original_score: number; improved_score: number | null;
    }>;

    if (rows.length === 0 && keywords.length >= 2) {
      const term1 = `%${keywords[0]}%`;
      const term2 = `%${keywords[1]}%`;
      rows = await sql`
        SELECT query, original_answer, improved_answer, gap_score,
               gaps_found, missing_keywords, was_improved,
               improvement_reason, provider_used, original_score, improved_score
        FROM agent_learning_log
        WHERE query ILIKE ${term1} AND query ILIKE ${term2}
          AND was_improved = TRUE
        ORDER BY created_at DESC
        LIMIT 1
      ` as Array<any>;
    }

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      query: r.query,
      originalAnswer: r.original_answer,
      improvedAnswer: r.improved_answer ?? undefined,
      gapScore: r.gap_score,
      gapsFound: r.gaps_found ?? [],
      missingKeywords: r.missing_keywords ?? [],
      wasImproved: r.was_improved,
      improvementReason: r.improvement_reason ?? undefined,
      providerUsed: r.provider_used,
      originalScore: r.original_score,
      improvedScore: r.improved_score ?? undefined,
    };
  } catch (err) {
    console.error('[SelfImprover] Failed to get similar learning:', err);
    return null;
  }
}

/**
 * Statistik learning untuk admin dashboard.
 */
export async function getLearningStats(env: CloudflareBindings): Promise<{
  totalLogs: number;
  totalImproved: number;
  avgGapScore: number;
  improvementRate: number;
}> {
  try {
    const sql = neon(env.DATABASE_URL);
    const rows = await sql`
      SELECT
        COUNT(*)::int AS total_logs,
        SUM(CASE WHEN was_improved THEN 1 ELSE 0 END)::int AS total_improved,
        AVG(gap_score)::float AS avg_gap_score
      FROM agent_learning_log
    ` as Array<{ total_logs: number; total_improved: number; avg_gap_score: number }>;

    const r = rows[0];
    const total = r?.total_logs ?? 0;
    const improved = r?.total_improved ?? 0;
    return {
      totalLogs: total,
      totalImproved: improved,
      avgGapScore: r?.avg_gap_score ?? 0,
      improvementRate: total > 0 ? improved / total : 0,
    };
  } catch (err) {
    console.error('[SelfImprover] Failed to get learning stats:', err);
    return { totalLogs: 0, totalImproved: 0, avgGapScore: 0, improvementRate: 0 };
  }
}

