import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { CloudflareBindings, QueryRequest, QueryResponse } from '../types';
import { classifyQuery } from '../asi/classifier';
import { rewriteAndExpand } from '../asi/rewriter';
import { adaptiveRetrieve, expandContiguousChunks } from '../asi/retrieval';
import { rerankChunks } from '../asi/rerank';
import { multiHopRetrieve } from '../asi/multi-hop';
import { generateAnswer, generateGroq, generateCohere, generateOpenRouter } from '../asi/generator';
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
import { TIMEOUT_GROQ, TIMEOUT_GEMINI, TIMEOUT_COHERE, TIMEOUT_OPENROUTER, TIMEOUT_FAST, ERROR_QUOTA_PRIMARY, ERROR_QUOTA_PREPROCESSING, ERROR_NOT_FOUND, ERROR_ABSTAIN, ERROR_ALL_PROVIDERS_FAILED, ERROR_SYSTEM, TOP_K_RESULTS, TOP_K_PRUNED, MAX_CORRECTIVE_RETRIES, GROUNDING_REGEN_THRESHOLD, CRITIC_PASS_THRESHOLD, CRITIC_FALLBACK_SCORE, ERROR_PREFIX } from '../constants';

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
        answer: ERROR_QUOTA_PRIMARY,
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
        answer: ERROR_QUOTA_PREPROCESSING,
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
          TIMEOUT_GROQ
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
      TIMEOUT_GROQ
    );
    await trackRPDCall('groq', env);
    reasoningPath.push(`Rewritten: '${rewritten}'`);
    if (variants.length > 0) reasoningPath.push(`Expanded: ${variants.length + 1} semantic variants`);

    const searchQueries = [...decomposed, rewritten, ...variants].filter(Boolean);
    const allResults = await Promise.all(
      searchQueries.map(q => adaptiveRetrieve(q, queryType, env, documentIds))
    );
    const flatResults = allResults.flat().sort((a, b) => b.score - a.score);
    let topResults = flatResults.slice(0, TOP_K_RESULTS);
    reasoningPath.push(`Hybrid retrieval: ${topResults.length} chunks retrieved`);

    if (queryType === 'complex' || shouldAbstain(topResults)) {
      const { results: hopResults, hops } = await multiHopRetrieve(query, queryType, env, documentIds);
      if (hops.length > 0) {
        topResults = hopResults;
        reasoningPath.push(...hops);
        reasoningPath.push(`Multi-hop: ${topResults.length} chunks after ${hops.length} hop(s)`);
      }
    }

    if (topResults.length > TOP_K_PRUNED) {
      topResults = await rerankChunks(topResults, query, env);
      reasoningPath.push(`Rerank applied: ${topResults.length} chunks re-scored`);
    }

    // Top-3 Token Pruning (E-CRAG 85% Token Savings) / Contiguous Window Expansion
    if (queryType === 'table' || queryType === 'complex') {
      topResults = await expandContiguousChunks(topResults, env, 5);
      reasoningPath.push(`Contiguous Table Expansion applied: ${topResults.length} linked document chunks retained`);
    } else {
      topResults = topResults.slice(0, TOP_K_PRUNED);
      reasoningPath.push(`Top-3 Token Pruning applied: ${topResults.length} high-confidence chunks retained`);
    }

    // Sentence-Level Context Compression (Token Optimization)
    topResults = compressContext(topResults, query);
    reasoningPath.push(`Sentence-Level Context Compression applied`);

    if (shouldAbstain(topResults)) {
      reasoningPath.push('Retrieval score below abstain threshold (< 0.55)');
      return c.json({
        answer: ERROR_NOT_FOUND,
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
    const groqFn = () => generateGroq(query, context, citations.map(c => `${c.docName}, Hal ${c.page}`), env);
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
        groqFn,
        async () => callWithFallback(
          cohereFn,
          async () => callWithFallback(
            openrouterFn,
            async () => {
              reasoningPath.push('Fallback: all providers failed');
              return `${ERROR_ALL_PROVIDERS_FAILED}\n\nBerdasarkan dokumen yang tersedia:\n\n${context.slice(0, 1000)}`;
            },
            'openrouter',
            TIMEOUT_OPENROUTER
          ),
          'cohere',
          TIMEOUT_COHERE
        ),
        'groq',
        TIMEOUT_GROQ
      ),
      'gemini',
      TIMEOUT_GEMINI
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
      async () => ({ score: CRITIC_FALLBACK_SCORE, issues: ['Critic unavailable'], verdict: 'retry' as const }),
      'groq',
      TIMEOUT_GROQ
    );
    reasoningPath.push(`Self-critic score: ${criticResult.score.toFixed(2)} (${criticResult.verdict})`);

    let retryCount = 0;
    while (criticResult.verdict === 'retry' && retryCount < MAX_CORRECTIVE_RETRIES) {
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
        TIMEOUT_GROQ
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
        TIMEOUT_GEMINI
      );

      const { score: retryGroundingScore } = validateGrounding(retryAnswer, retryContext);
      criticResult = await callWithFallback(
        async () => {
          const result = await selfCritic(correctiveAction.adjusted_query || query, retryAnswer, retryContext, env);
          await trackRPDCall('groq', env);
          return result;
        },
        async () => ({ score: retryGroundingScore, issues: [], verdict: retryGroundingScore >= CRITIC_PASS_THRESHOLD ? 'pass' as const : 'abstain' as const }),
        'groq',
        TIMEOUT_GROQ
      );
      reasoningPath.push(`Corrective retry ${retryCount} score: ${criticResult.score.toFixed(2)} (${criticResult.verdict})`);

      if (criticResult.score > (criticResult.verdict === 'pass' ? 0 : groundingScore)) {
        answer = retryAnswer;
        finalScore = criticResult.score;
      }
    }

    if (!isGrounded && groundingScore < GROUNDING_REGEN_THRESHOLD && retryCount === 0) {
      reasoningPath.push(`Regeneration: grounding score < ${GROUNDING_REGEN_THRESHOLD}, retrying with stricter prompt`);
      const strictPrompt = `${answer}\n\nPERINGATAN: Jawaban di atas mengandung klaim yang tidak didukung konteks.\nHanya gunakan informasi dari konteks berikut:\n${context}`;

      const regenerateFn = () => generateAnswer(query, context + '\n' + strictPrompt, citations.map(c => `${c.docName}, Hal ${c.page}`), env);
      const retryAnswer = await callWithFallback(
        regenerateFn,
        async () => answer,
        'gemini',
        TIMEOUT_GEMINI
      );

      const { score: retryScore } = validateGrounding(retryAnswer, context);
      finalAnswer = retryScore > groundingScore ? retryAnswer : answer;
      finalScore = Math.max(retryScore, groundingScore);
      reasoningPath.push(`Regeneration score: ${Math.max(retryScore, groundingScore).toFixed(2)}`);
    }

    if (criticResult.verdict === 'abstain') {
      await trackNegativePattern(query, env);
      reasoningPath.push('Logged to Negative Feedback Memory Bank');
      finalAnswer = ERROR_ABSTAIN;
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

    const queryEmbForCache = await callWithFallback(() => embedQuery(query, env), async () => [], 'gemini', TIMEOUT_FAST);
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
    if (finalAnswer && !finalAnswer.includes(ERROR_PREFIX)) {
      await setCache(query, cacheEntry, env);
    }

    return c.json(response);
  } catch (error: any) {
    reasoningPath.push(`Error: ${error.message || 'Internal server error'}`);
    return c.json({
      answer: ERROR_SYSTEM,
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

ragRouter.post('/feedback', zValidator('json', feedbackSchema), async (c) => {
  try {
    const body = c.req.valid('json') as { query: string; userId: string; rating: 'up' | 'down' };
    await recordFeedback(body.query, body.userId, body.rating, c.env);
    return c.json({ success: true, message: 'Feedback recorded' });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default ragRouter;
