import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { CloudflareBindings, QueryRequest, QueryResponse } from '../types';
import { classifyQuery } from '../asi/classifier';
import { rewriteAndExpand } from '../asi/rewriter';
import { adaptiveRetrieve } from '../asi/retrieval';
import { rerankChunks } from '../asi/rerank';
import { multiHopRetrieve } from '../asi/multi-hop';
import { generateAnswer, generateCohere, generateOpenRouter } from '../asi/generator';
import { shouldAnswer, shouldAbstain, buildCitations, validateGrounding } from '../asi/grounding';
import { getFromCache, setCache, trackNegativePattern, isNegativePattern } from '../asi/cache';
import { callWithFallback } from '../asi/router';
import { decomposeQuery } from '../asi/sub-question';
import { selfCritic } from '../asi/critic';
import { correctiveRAG } from '../asi/corrective';
import { recordFeedback } from '../asi/feedback';
import { compressContext } from '../asi/compressor';
import { checkRPDLimit, trackRPDCall } from '../utils/rpd-tracker';
import { checkProviderRateLimit } from '../middleware/rate-limiter';
import { embedQuery } from '../utils/embedding';

const ragRouter = new Hono<{ Bindings: CloudflareBindings }>();

const querySchema = z.object({
  query: z.string().min(1).max(1000),
  userId: z.string().min(1),
  documentIds: z.array(z.string()).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
});

ragRouter.post('/query', zValidator('json', querySchema), async (c) => {
  const { query, userId, documentIds, history } = c.req.valid('json') as QueryRequest;
  const env = c.env;
  const reasoningPath: string[] = [];

  try {
    const cached = await getFromCache(query, env);
    if (cached) {
      reasoningPath.push('Cache hit: L1 exact or L2 semantic match');
      return c.json({
        answer: cached.response,
        citations: cached.citations,
        confidence: cached.score,
        asiScore: cached.asiScore,
        reasoningPath: [...cached.reasoningPath, ...reasoningPath],
        sources: cached.sources,
      });
    }

    const geminiBudget = await checkRPDLimit('gemini', env);
    if (!geminiBudget.allowed) {
      return c.json({
        answer: 'Maaf, kuota API harian untuk layanan primary telah habis. Silakan coba lagi besok.',
        citations: [],
        confidence: 0,
        asiScore: 0,
        reasoningPath: ['Gemini RPD limit reached'],
        sources: [],
      } as QueryResponse, 429);
    }

    const groqBudget = await checkRPDLimit('groq', env);
    if (!groqBudget.allowed) {
      return c.json({
        answer: 'Maaf, kuota preprocessing harian telah habis. Silakan coba lagi besok.',
        citations: [],
        confidence: 0,
        asiScore: 0,
        reasoningPath: ['Groq RPD limit reached'],
        sources: [],
      } as QueryResponse, 429);
    }

    const queryType = classifyQuery(query);
    reasoningPath.push(`Query classified as: ${queryType}`);

    const decomposed = queryType === 'complex'
      ? await callWithFallback(
          () => decomposeQuery(query, env),
          async () => [query],
          'groq',
          10000
        )
      : [query];
    if (decomposed.length > 1) {
      await trackRPDCall('groq', env);
      reasoningPath.push(`Decomposed: ${decomposed.length} sub-questions`);
    }

    const { rewritten, variants } = await callWithFallback(
      () => rewriteAndExpand(query, queryType, env, history),
      async () => ({ rewritten: query, variants: [query] }),
      'groq',
      10000
    );
    await trackRPDCall('groq', env);
    reasoningPath.push(`Rewritten: '${rewritten}'`);
    if (variants.length > 0) reasoningPath.push(`Expanded: ${variants.length + 1} semantic variants`);

    const searchQueries = [...decomposed, rewritten, ...variants].filter(Boolean);
    const allResults = await Promise.all(
      searchQueries.map(q => adaptiveRetrieve(q, queryType, env, documentIds))
    );
    const flatResults = allResults.flat().sort((a, b) => b.score - a.score);
    let topResults = flatResults.slice(0, 10);
    reasoningPath.push(`Hybrid retrieval: ${topResults.length} chunks retrieved`);

    if (queryType === 'complex' || shouldAbstain(topResults)) {
      const { results: hopResults, hops } = await multiHopRetrieve(query, queryType, env, documentIds);
      if (hops.length > 0) {
        topResults = hopResults;
        reasoningPath.push(...hops);
        reasoningPath.push(`Multi-hop: ${topResults.length} chunks after ${hops.length} hop(s)`);
      }
    }

    if (topResults.length > 3) {
      topResults = await rerankChunks(topResults, query, env);
      reasoningPath.push(`Rerank applied: ${topResults.length} chunks re-scored`);
    }

    // Top-3 Token Pruning (E-CRAG 85% Token Savings)
    topResults = topResults.slice(0, 3);
    reasoningPath.push(`Top-3 Token Pruning applied: ${topResults.length} high-confidence chunks retained`);

    // Sentence-Level Context Compression (Token Optimization)
    topResults = compressContext(topResults, query);
    reasoningPath.push(`Sentence-Level Context Compression applied`);

    if (shouldAbstain(topResults)) {
      reasoningPath.push('Retrieval score below abstain threshold (< 0.55)');
      return c.json({
        answer: 'Maaf, informasi yang Anda tanyakan tidak ditemukan dalam dokumen yang tersedia.',
        citations: [],
        confidence: 0,
        asiScore: 0,
        reasoningPath,
        sources: [],
      } as QueryResponse);
    }

    const { citations, sources, context } = await buildCitations(topResults, env);
    reasoningPath.push(`Citations built: ${citations.length} sources`);

    const geminiLimit = await checkProviderRateLimit('gemini', env);
    if (!geminiLimit.allowed) {
      reasoningPath.push(`Gemini global RPM limit reached (${geminiLimit.remaining || 0} remaining)`);
    }

    const groqLimit = await checkProviderRateLimit('groq', env);
    if (!groqLimit.allowed) {
      reasoningPath.push(`Groq global RPM limit reached (${groqLimit.remaining || 0} remaining)`);
    }

    const generateFn = () => generateAnswer(query, context, citations.map(c => `${c.docName}, Hal ${c.page}`), env);
    const cohereFn = () => generateCohere(query, context, citations.map(c => `${c.docName}, Hal ${c.page}`), env);
    const openrouterFn = () => generateOpenRouter(query, context, citations.map(c => `${c.docName}, Hal ${c.page}`), env);

    let answer = await callWithFallback(
      async () => {
        if (!geminiLimit.allowed) throw new Error('Gemini RPM limit exceeded');
        const result = await generateFn();
        await trackRPDCall('gemini', env);
        return result;
      },
      async () => callWithFallback(
        cohereFn,
        async () => callWithFallback(
          openrouterFn,
          async () => {
            reasoningPath.push('Fallback: all providers failed');
            return `[Maaf, semua layanan tidak tersedia]\n\nBerdasarkan dokumen yang tersedia:\n\n${context.slice(0, 1000)}`;
          },
          'openrouter',
          25000
        ),
        'cohere',
        20000
      ),
      'gemini',
      15000
    );

    const { score: groundingScore, isGrounded } = validateGrounding(answer, context);
    reasoningPath.push(`Grounding score: ${groundingScore.toFixed(2)} (${isGrounded ? 'pass' : 'fail'})`);

    let finalAnswer = answer;
    let finalScore = Math.min(topResults[0]?.score || 0, groundingScore);

    let criticResult = await callWithFallback(
      async () => {
        const result = await selfCritic(query, answer, context, env);
        await trackRPDCall('groq', env);
        return result;
      },
      async () => ({ score: 0.5, issues: ['Critic unavailable'], verdict: 'retry' as const }),
      'groq',
      10000
    );
    reasoningPath.push(`Self-critic score: ${criticResult.score.toFixed(2)} (${criticResult.verdict})`);

    let retryCount = 0;
    while (criticResult.verdict === 'retry' && retryCount < 2) {
      retryCount++;
      reasoningPath.push(`Corrective RAG attempt ${retryCount}`);

      const correctiveAction = await callWithFallback(
        async () => {
          const result = await correctiveRAG(query, {
            strategy: criticResult.issues.join(', '),
            score: criticResult.score,
            issues: criticResult.issues,
          }, env);
          await trackRPDCall('groq', env);
          return result;
        },
        async () => ({ strategy: 'rewrite' as const, adjusted_query: query }),
        'groq',
        10000
      );
      reasoningPath.push(`Corrective strategy: ${correctiveAction.strategy}`);

      const retryContext = context;
      const retryAnswer = await callWithFallback(
        async () => {
          const result = await generateAnswer(correctiveAction.adjusted_query || query, retryContext, citations.map(c => `${c.docName}, Hal ${c.page}`), env);
          await trackRPDCall('gemini', env);
          return result;
        },
        async () => answer,
        'gemini',
        15000
      );

      const { score: retryGroundingScore } = validateGrounding(retryAnswer, retryContext);
      criticResult = await callWithFallback(
        async () => {
          const result = await selfCritic(correctiveAction.adjusted_query || query, retryAnswer, retryContext, env);
          await trackRPDCall('groq', env);
          return result;
        },
        async () => ({ score: retryGroundingScore, issues: [], verdict: retryGroundingScore >= 0.7 ? 'pass' as const : 'abstain' as const }),
        'groq',
        10000
      );
      reasoningPath.push(`Corrective retry ${retryCount} score: ${criticResult.score.toFixed(2)} (${criticResult.verdict})`);

      if (criticResult.score > (criticResult.verdict === 'pass' ? 0 : groundingScore)) {
        answer = retryAnswer;
        finalScore = criticResult.score;
      }
    }

    if (!isGrounded && groundingScore < 0.8 && retryCount === 0) {
      reasoningPath.push('Regeneration: grounding score < 0.8, retrying with stricter prompt');
      const strictPrompt = `${answer}\n\nPERINGATAN: Jawaban di atas mengandung klaim yang tidak didukung konteks.\nHanya gunakan informasi dari konteks berikut:\n${context}`;

      const regenerateFn = () => generateAnswer(query, context + '\n' + strictPrompt, citations.map(c => `${c.docName}, Hal ${c.page}`), env);
      const retryAnswer = await callWithFallback(
        regenerateFn,
        async () => answer,
        'gemini',
        15000
      );

      const { score: retryScore } = validateGrounding(retryAnswer, context);
      finalAnswer = retryScore > groundingScore ? retryAnswer : answer;
      finalScore = Math.max(retryScore, groundingScore);
      reasoningPath.push(`Regeneration score: ${Math.max(retryScore, groundingScore).toFixed(2)}`);
    }

    if (criticResult.verdict === 'abstain') {
      await trackNegativePattern(query, env);
      reasoningPath.push('Logged to Negative Feedback Memory Bank');
      finalAnswer = 'Maaf, saya tidak dapat memberikan jawaban yang akurat berdasarkan dokumen yang tersedia. Silakan periksa ulang pertanyaan Anda atau konsultasi dengan staff akademik.';
      finalScore = 0;
    } else {
      finalAnswer = answer;
      finalScore = Math.max(groundingScore, criticResult.score);
    }
    const asiScore = (finalScore + (shouldAnswer(topResults) ? 1 : 0)) / 2;
    reasoningPath.push(`ASI score: ${asiScore.toFixed(2)}`);

    const response: QueryResponse = {
      answer: finalAnswer,
      citations,
      confidence: finalScore,
      asiScore,
      reasoningPath,
      sources,
    };

    const queryEmbForCache = await callWithFallback(() => embedQuery(query, env), async () => [], 'gemini', 5000);
    const cacheEntry = {
      query,
      queryEmbedding: queryEmbForCache,
      response: finalAnswer,
      citations,
      sources,
      score: finalScore,
      asiScore,
      hitCount: 1,
      timestamp: Date.now(),
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      reasoningPath,
    };
    if (finalAnswer && !finalAnswer.includes('Maaf')) {
      await setCache(query, cacheEntry, env);
    }

    return c.json(response);
  } catch (error: any) {
    reasoningPath.push(`Error: ${error.message || 'Internal server error'}`);
    return c.json({
      answer: 'Maaf, terjadi kesalahan pada sistem. Silakan coba beberapa saat lagi.',
      citations: [],
      confidence: 0,
      asiScore: 0,
      reasoningPath,
      sources: [],
    } as QueryResponse, 500);
  }
});

const feedbackSchema = z.object({
  query: z.string().min(1),
  userId: z.string().min(1),
  rating: z.enum(['up', 'down']),
});

ragRouter.post('/feedback', async (c) => {
  const body = await c.req.json() as { query: string; userId: string; rating: 'up' | 'down' };
  await recordFeedback(body.query, body.userId, body.rating, c.env);
  return c.json({ success: true, message: 'Feedback recorded' });
});

export default ragRouter;
