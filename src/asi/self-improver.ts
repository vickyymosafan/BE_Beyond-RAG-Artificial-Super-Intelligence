/**
 * ASI Parallel Self-Improvement Agent (Agent ke-2)
 *
 * Berjalan secara background (non-blocking) setelah main RAG pipeline merespons user.
 * Tugasnya:
 * 1. Ambil raw chunks dari Neon DB (lebih luas dari yang dipakai RAG)
 * 2. Analisis gap: informasi apa yang ada di DB tapi tidak ada di jawaban AI?
 * 3. Jika gap signifikan → generate jawaban yang lebih lengkap via LLM
 * 4. Update KV Cache → query berikutnya otomatis lebih baik
 * 5. Simpan learning log ke Neon DB untuk audit trail
 *
 * Dipanggil via: c.executionCtx.waitUntil(runSelfImprovementAgent(...))
 */

import { neon } from '@neondatabase/serverless';
import type { CloudflareBindings, SelfImproverContext, GapAnalysisResult, RetrievalResult } from '../types';
import {
  GAP_THRESHOLD,
  TOP_K_BROAD,
  SELF_IMPROVER_ENABLED,
  MIN_GAP_KEYWORDS,
  GROQ_API_URL,
  GROQ_MODEL_VERSATILE,
  LLM_TEMPERATURE_LOW,
  SELF_IMPROVER_MAX_TOKENS,
  LLM_TOP_P,
} from '../constants';
import { insertLearningLog, createInitialLearningLog, updateLearningLog } from '../db/learning-queries';
import { setCache } from './cache';

// ─── Stop words untuk filtering keyword yang tidak relevan ───────────────────
const STOP_WORDS = new Set([
  'yang', 'dan', 'atau', 'di', 'ke', 'dari', 'ini', 'itu', 'dengan', 'untuk',
  'pada', 'adalah', 'dalam', 'oleh', 'tidak', 'juga', 'sudah', 'akan', 'bisa',
  'ada', 'dapat', 'jika', 'maka', 'serta', 'telah', 'harus', 'antara', 'bahwa',
  'the', 'a', 'an', 'and', 'or', 'is', 'are', 'was', 'were', 'in', 'of', 'to',
  'for', 'on', 'at', 'by', 'with', 'as', 'it', 'be', 'has', 'had', 'that',
]);

// ─── Ekstrak keyword bermakna dari teks ──────────────────────────────────────
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

// ─── Hitung berapa % keyword dari DB yang tidak ada di jawaban AI ─────────────
function computeGapScore(answer: string, rawChunks: RetrievalResult[]): GapAnalysisResult {
  const answerKeywords = new Set(extractKeywords(answer));
  const dbText = rawChunks.map(r => r.content).join(' ');
  const dbKeywords = extractKeywords(dbText);

  // Deduplicate DB keywords
  const uniqueDbKeywords = [...new Set(dbKeywords)];

  // Keyword yang ada di DB tapi TIDAK ada di jawaban
  const missingKeywords = uniqueDbKeywords.filter(kw => !answerKeywords.has(kw));

  // Gap score = rasio missing / total unique DB keywords
  const gapScore = uniqueDbKeywords.length > 0
    ? missingKeywords.length / uniqueDbKeywords.length
    : 0;

  // Identifikasi gaps sebagai frasa konteks dari dokumen
  const gapsFound = identifyGapContexts(missingKeywords.slice(0, 20), rawChunks);

  const shouldImprove = gapScore > GAP_THRESHOLD && missingKeywords.length >= MIN_GAP_KEYWORDS;

  return { gapScore, missingKeywords: missingKeywords.slice(0, 30), gapsFound, shouldImprove };
}

// ─── Identifikasi konteks dari keyword yang hilang ───────────────────────────
function identifyGapContexts(missingKws: string[], chunks: RetrievalResult[]): string[] {
  const gaps: string[] = [];

  for (const chunk of chunks) {
    const chunkKws = extractKeywords(chunk.content);
    const matchCount = missingKws.filter(kw => chunkKws.includes(kw)).length;

    if (matchCount >= 2) {
      // Ambil kalimat pertama yang relevan sebagai deskripsi gap
      const sentences = chunk.content.split(/[.!?]\s+/);
      const relevantSentence = sentences.find(s =>
        missingKws.some(kw => s.toLowerCase().includes(kw))
      );
      if (relevantSentence && relevantSentence.length > 20) {
        gaps.push(relevantSentence.trim().slice(0, 200));
      }
    }
  }

  return [...new Set(gaps)].slice(0, 5);
}

// ─── Ambil raw chunks dari Neon DB lebih luas (untuk verifikasi mendalam) ────
async function getBroadChunksFromDB(
  query: string,
  env: CloudflareBindings
): Promise<RetrievalResult[]> {
  try {
    const sql = neon(env.DATABASE_URL);
    const keywords = query
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 8);

    if (keywords.length === 0) return [];

    const searchPattern = keywords.join(' | ');

    const rows = await sql`
      SELECT id, doc_id, content, content_type, page_number, section_title,
             ts_rank(tsv_content, to_tsquery('simple', ${searchPattern})) AS score
      FROM chunks
      WHERE (
        tsv_content @@ to_tsquery('simple', ${searchPattern})
        OR content ILIKE ${'%' + keywords[0] + '%'}
      ) AND is_active = TRUE
      ORDER BY score DESC
      LIMIT ${TOP_K_BROAD}
    ` as Array<{
      id: string; doc_id: string; content: string;
      content_type: string; page_number: number; section_title: string; score: number;
    }>;

    return rows.map(r => ({
      chunkId: r.id,
      docId: r.doc_id,
      content: r.content,
      contentType: r.content_type,
      pageNumber: r.page_number,
      sectionTitle: r.section_title,
      score: r.score || 0.5,
      source: 'bm25' as const,
    }));
  } catch (err) {
    console.error('[SelfImprover] getBroadChunksFromDB failed:', err);
    return [];
  }
}

// ─── Generate jawaban yang lebih lengkap menggunakan Groq ────────────────────
async function generateImprovedAnswer(
  query: string,
  rawChunks: RetrievalResult[],
  originalAnswer: string,
  missingKeywords: string[],
  env: CloudflareBindings
): Promise<{ answer: string; provider: string }> {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) return { answer: originalAnswer, provider: 'none' };

  const fullContext = rawChunks
    .slice(0, 12) // Batasi 12 chunk untuk menghindari token overflow
    .map((r, i) =>
      `[Chunk ${i + 1} | Hal ${r.pageNumber} | ${r.sectionTitle}]\n${r.content.slice(0, 800)}`
    ).join('\n\n---\n\n');

  const missingHint = missingKeywords.length > 0
    ? `\n\nKEYWORD YANG BELUM TERCAKUP (wajib dimasukkan jika relevan): ${missingKeywords.slice(0, 15).join(', ')}`
    : '';

  const systemPrompt = `Anda adalah AI akademik self-improvement agent.
Tugas Anda: perbaiki jawaban AI berikut agar LEBIH LENGKAP dan DETAIL berdasarkan konteks dokumen yang lebih luas.

ATURAN:
1. Pertahankan informasi yang sudah benar di jawaban awal.
2. TAMBAHKAN informasi yang belum ada tapi ada di konteks dokumen.
3. JANGAN menambahkan informasi di luar konteks dokumen.
4. Gunakan format Markdown yang sama dengan jawaban awal.
5. Jika pertanyaan tentang tabel, pastikan SEMUA baris tabel disertakan.
6. Jika pertanyaan tentang PROPOSAL TUGAS AKHIR, pastikan HANYA memuat 9 poin Sistematika Proposal. JANGAN mencampur dengan Laporan Tugas Akhir.
7. Jika pertanyaan tentang LAPORAN TUGAS AKHIR, pastikan memuat 20 poin Sistematika Laporan lengkap dari Halaman Sampul s/d Biodata Penulis.
8. Jika membuat daftar, gunakan indentasi 4 spasi untuk sub-poin.
${missingHint}`;

  // 1. Try Gemini first (or if Groq fails)
  if (env.GEMINI_API_KEY) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nKONTEKS DOKUMEN:\n${fullContext}\n\nPERTANYAAN ASLI: ${query}\n\nJAWABAN SEBELUMNYA:\n${originalAnswer}\n\nTUGAS: Buat versi yang lebih lengkap dan detail:` }]
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
      });

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json() as any;
        const geminiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (geminiText && geminiText.length > 50) {
          return { answer: geminiText, provider: 'gemini-improver' };
        }
      }
    } catch (gErr) {
      console.error('[SelfImprover] Gemini improver failed:', gErr);
    }
  }

  // 2. Try Groq if Gemini unavailable
  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL_VERSATILE,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `KONTEKS DOKUMEN (lebih luas):\n${fullContext}\n\nPERTANYAAN ASLI: ${query}\n\nJAWABAN AI SEBELUMNYA:\n${originalAnswer}\n\nTUGAS: Buat versi yang lebih lengkap dan detail dari jawaban di atas:` },
        ],
        temperature: LLM_TEMPERATURE_LOW,
        max_tokens: SELF_IMPROVER_MAX_TOKENS,
        top_p: LLM_TOP_P,
      }),
    });

    if (!res.ok) throw new Error(`Groq error: ${res.status}`);

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const improved = data?.choices?.[0]?.message?.content?.trim();

    if (improved && improved.length > 50) {
      return { answer: improved, provider: 'groq' };
    }
    return { answer: originalAnswer, provider: 'groq-fallback' };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { answer: originalAnswer, provider: `error: ${errorMsg}` };
  }
}

// ─── Update KV Cache dengan jawaban yang sudah diperbaiki ────────────────────
async function updateCacheWithImprovedAnswer(
  ctx: SelfImproverContext,
  improvedAnswer: string,
  env: CloudflareBindings
): Promise<void> {
  try {
    const improvedEntry = {
      query: ctx.query,
      queryEmbedding: [] as number[], // Embedding tidak di-regenerate untuk efisiensi
      response: improvedAnswer,
      citations: ctx.citations,
      sources: ctx.citations.map(c => ({ docId: c.docName, page: c.page, chunkId: '' })),
      score: Math.min(ctx.groundingScore + 0.1, 1.0), // Sedikit boost karena sudah di-improve
      asiScore: Math.min(ctx.groundingScore + 0.05, 1.0),
      hitCount: 1,
      timestamp: Date.now(),
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      reasoningPath: ['[Agent-2] Autonomously improved by Self-Improvement Agent'],
    };

    await setCache(ctx.query, improvedEntry, env);
    console.log(`[SelfImprover] Cache updated for query: "${ctx.query.slice(0, 50)}..."`);
  } catch (err) {
    console.error('[SelfImprover] updateCacheWithImprovedAnswer failed:', err);
  }
}

// ─── MAIN: Fungsi utama yang dipanggil via c.executionCtx.waitUntil() ────────
/**
 * Jalankan Self-Improvement Agent secara background setelah response dikirim ke user.
 *
 * @param ctx - Context berisi query, finalAnswer, groundingScore, citations
 * @param env - Cloudflare bindings (DATABASE_URL, KV_CACHE, API keys)
 */
export async function runSelfImprovementAgent(
  ctx: SelfImproverContext,
  env: CloudflareBindings
): Promise<void> {
  if (!SELF_IMPROVER_ENABLED) return;

  const startTime = Date.now();
  console.log(`[SelfImprover] Starting background verification for: "${ctx.query.slice(0, 60)}..."`);

  // 0. Buat log entri awal dengan status 'in-progress'
  const logId = await createInitialLearningLog(ctx.query, ctx.finalAnswer, ctx.groundingScore, env);

  try {
    // 1. Cek apakah jawaban awal adalah Abstain / "Maaf"
    const isAbstainAnswer = ctx.finalAnswer.startsWith('Maaf') ||
      ctx.finalAnswer.includes('tidak ditemukan dalam dokumen');

    if (isAbstainAnswer) {
      console.log(`[SelfImprover] Answer was "Maaf" / Abstain. Performing deep Neon DB verification...`);
      const deepChunks = await getBroadChunksFromDB(ctx.query, env);
      
      const queryKws = extractKeywords(ctx.query);
      const relevantChunks = deepChunks.filter(c => {
        const chunkText = c.content.toLowerCase();
        return queryKws.some(kw => chunkText.includes(kw));
      });

      if (relevantChunks.length > 0) {
        console.log(`[SelfImprover] Found ${relevantChunks.length} relevant chunks in Neon DB for Abstain query! Attempting self-correction...`);
        const { answer: improvedAnswer, provider } = await generateImprovedAnswer(
          ctx.query,
          relevantChunks,
          ctx.finalAnswer,
          queryKws,
          env
        );

        if (improvedAnswer && !improvedAnswer.startsWith('Maaf') && improvedAnswer.length > 200) {
          await updateCacheWithImprovedAnswer(ctx, improvedAnswer, env);
          const updateData = {
            improvedAnswer,
            gapScore: 1.0,
            gapsFound: [`RAG Awal Abstain ("Maaf"), tetapi Agent-2 menemukan konteks relevan pada ${relevantChunks.length} chunk di Neon DB.`],
            missingKeywords: queryKws,
            wasImproved: true,
            improvementReason: 'Self-Correction: RAG Awal Abstain ("Maaf"), tetapi Agent-2 menemukan konteks di Neon DB dan berhasil memperbaiki jawaban.',
            providerUsed: provider,
            improvedScore: 0.90,
          };
          if (logId) await updateLearningLog(logId, updateData, env);
          else await insertLearningLog({ query: ctx.query, originalAnswer: ctx.finalAnswer, originalScore: 0.0, ...updateData }, env);

          console.log(`[SelfImprover] ✅ Successfully self-corrected Abstain query! Saved to Neon DB & Cache.`);
          return;
        }
      }

      // Jika benar-benar TIDAK ADA di Neon DB:
      console.log(`[SelfImprover] Verified: Information genuinely NOT FOUND in Neon DB.`);
      const absentData = {
        gapScore: 0.0,
        gapsFound: [],
        missingKeywords: [],
        wasImproved: false,
        improvementReason: 'Dokumen memang TIDAK MEMUAT informasi ini (Verified Absent di Neon DB). Tidak perlu di-improve.',
        providerUsed: 'verified-absent',
      };
      if (logId) await updateLearningLog(logId, absentData, env);
      else await insertLearningLog({ query: ctx.query, originalAnswer: ctx.finalAnswer, originalScore: 0.0, ...absentData }, env);
      return;
    }

    // 2. Ambil raw chunks dari Neon DB (lebih luas dari yang dipakai RAG)
    const rawChunks = await getBroadChunksFromDB(ctx.query, env);

    if (rawChunks.length === 0) {
      console.log('[SelfImprover] No DB chunks found for verification, skipping.');
      const absentData = {
        gapScore: 0.0,
        gapsFound: [],
        missingKeywords: [],
        wasImproved: false,
        improvementReason: 'Dokumen memang TIDAK MEMUAT informasi ini (Verified Absent di Neon DB). Tidak perlu di-improve.',
        providerUsed: 'verified-absent',
      };
      if (logId) await updateLearningLog(logId, absentData, env);
      else await insertLearningLog({ query: ctx.query, originalAnswer: ctx.finalAnswer, originalScore: 0.0, ...absentData }, env);
      return;
    }

    // 3. Analisis gap: berapa % informasi DB yang tidak ada di jawaban AI
    const gapAnalysis = computeGapScore(ctx.finalAnswer, rawChunks);

    console.log(
      `[SelfImprover] Gap score: ${(gapAnalysis.gapScore * 100).toFixed(1)}% | ` +
      `Missing keywords: ${gapAnalysis.missingKeywords.length} | ` +
      `Should improve: ${gapAnalysis.shouldImprove}`
    );

    if (gapAnalysis.shouldImprove) {
      // 4. Generate jawaban yang lebih lengkap
      console.log('[SelfImprover] Gap exceeds threshold, generating improved answer...');
      const { answer: improvedAnswer, provider } = await generateImprovedAnswer(
        ctx.query,
        rawChunks,
        ctx.finalAnswer,
        gapAnalysis.missingKeywords,
        env
      );

      const wasActuallyImproved = improvedAnswer !== ctx.finalAnswer &&
        improvedAnswer.length > 200 &&
        !improvedAnswer.startsWith('Maaf') &&
        provider !== 'error' &&
        provider !== 'none';

      if (wasActuallyImproved) {
        await updateCacheWithImprovedAnswer(ctx, improvedAnswer, env);
        const improvedData = {
          improvedAnswer,
          gapScore: gapAnalysis.gapScore,
          gapsFound: gapAnalysis.gapsFound,
          missingKeywords: gapAnalysis.missingKeywords,
          wasImproved: true,
          improvementReason: `Gap ${(gapAnalysis.gapScore * 100).toFixed(1)}% | ${gapAnalysis.missingKeywords.slice(0, 5).join(', ')}`,
          providerUsed: provider,
          improvedScore: Math.min(ctx.groundingScore + 0.1, 1.0),
        };
        if (logId) await updateLearningLog(logId, improvedData, env);
        else await insertLearningLog({ query: ctx.query, originalAnswer: ctx.finalAnswer, originalScore: ctx.groundingScore, ...improvedData }, env);

        const duration = Date.now() - startTime;
        console.log(`[SelfImprover] ✅ Improvement complete in ${duration}ms. Cache updated.`);
      } else {
        const failedData = {
          gapScore: gapAnalysis.gapScore,
          gapsFound: gapAnalysis.gapsFound,
          missingKeywords: gapAnalysis.missingKeywords,
          wasImproved: false,
          improvementReason: `Failed to improve: ${provider}`,
          providerUsed: provider,
        };
        if (logId) await updateLearningLog(logId, failedData, env);
        else await insertLearningLog({ query: ctx.query, originalAnswer: ctx.finalAnswer, originalScore: ctx.groundingScore, ...failedData }, env);
        console.log(`[SelfImprover] Improvement did not succeed (${provider}), keeping original.`);
      }
    } else {
      // Gap tidak signifikan — jawaban sudah bagus
      const verifiedData = {
        gapScore: gapAnalysis.gapScore,
        gapsFound: [],
        missingKeywords: gapAnalysis.missingKeywords.slice(0, 5),
        wasImproved: false,
        improvementReason: `Gap ${(gapAnalysis.gapScore * 100).toFixed(1)}% below threshold — answer is good`,
        providerUsed: 'verified-optimal',
      };
      if (logId) await updateLearningLog(logId, verifiedData, env);
      else await insertLearningLog({ query: ctx.query, originalAnswer: ctx.finalAnswer, originalScore: ctx.groundingScore, ...verifiedData }, env);

      const duration = Date.now() - startTime;
      console.log(`[SelfImprover] ✅ Answer verified in ${duration}ms. No improvement needed.`);
    }
  } catch (err) {
    // Top-level catch — jangan pernah throw dari background task
    console.error('[SelfImprover] Unexpected error in background agent:', err);
  }
}

