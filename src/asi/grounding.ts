import type { RetrievalResult, Citation, Source, CloudflareBindings } from '../types';
import { getDocumentTitle } from '../db/queries';
import { THRESHOLD_ANSWER, THRESHOLD_ABSTAIN, GROUNDING_THRESHOLD, GROUNDING_REGEN_THRESHOLD } from '../constants';

export function shouldAnswer(results: RetrievalResult[]): boolean {
  if (results.length === 0) return false;
  const topScore = results[0].score;
  return topScore >= THRESHOLD_ANSWER;
}

export function shouldAbstain(results: RetrievalResult[]): boolean {
  if (results.length === 0) return true;
  const topScore = results[0].score;
  return topScore < THRESHOLD_ABSTAIN;
}


function tokenize(s: string): Set<string> {
  const words = s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  return new Set(words);
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function keywordRecall(answer: string, context: string): number {
  const ansTerms = tokenize(answer);
  const ctxTerms = tokenize(context);
  if (ansTerms.size === 0 || ctxTerms.size === 0) return 0;

  const stopWords = new Set(['yang', 'dan', 'di', 'dari', 'dengan', 'untuk', 'pada', 'dalam',
    'ini', 'itu', 'tidak', 'akan', 'telah', 'sudah', 'bisa', 'dapat', 'oleh', 'sebagai',
    'lebih', 'saja', 'apa', 'bagaimana', 'mengapa', 'kapan', 'siapa', 'mana', 'apakah',
    'ke', 'ada', 'atau', 'juga', 'satu', 'tentang', 'antara', 'setelah']);

  let matched = 0;
  let totalSignificant = 0;
  for (const term of ctxTerms) {
    if (stopWords.has(term)) continue;
    totalSignificant++;
    if (ansTerms.has(term)) matched++;
  }

  return totalSignificant === 0 ? 0 : matched / totalSignificant;
}

export function exactPhraseMatch(claim: string, context: string): boolean {
  const phrases = claim.match(/[""]([^""]+)[""]/g) || [];
  if (phrases.length === 0) return true;
  const lowerContext = context.toLowerCase();
  return phrases.every(p => {
    const clean = p.replace(/[""]/g, '').toLowerCase().trim();
    return clean.length > 0 ? lowerContext.includes(clean) : true;
  });
}

export async function buildCitations(
  results: RetrievalResult[],
  env: CloudflareBindings
): Promise<{ citations: Citation[]; sources: Source[]; context: string }> {
  const citations: Citation[] = [];
  const sources: Source[] = [];
  const seen = new Set<string>();
  const contextParts: string[] = [];

  for (const r of results) {
    if (seen.has(r.chunkId)) continue;
    seen.add(r.chunkId);

    const docName = await getDocumentTitle(r.docId, env);

    citations.push({
      docName,
      page: r.pageNumber,
      text: r.content.slice(0, 200),
    });

    sources.push({
      docId: r.docId,
      page: r.pageNumber,
      chunkId: r.chunkId,
    });

    contextParts.push(`[${docName}, Hal ${r.pageNumber}]: ${r.content}`);
  }

  return {
    citations,
    sources,
    context: contextParts.join('\n\n'),
  };
}

export function validateGrounding(
  answer: string,
  context: string
): { score: number; isGrounded: boolean } {
  const jScore = jaccardSimilarity(answer, context);
  const recall = keywordRecall(answer, context);
  const phrasesMatch = exactPhraseMatch(answer, context);
  const score = Math.max(jScore, recall * GROUNDING_REGEN_THRESHOLD) * (phrasesMatch ? 1 : 0.5);
  return { score, isGrounded: score >= GROUNDING_THRESHOLD };
}
