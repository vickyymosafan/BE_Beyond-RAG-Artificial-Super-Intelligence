import type { RetrievalResult } from '../types';

/**
 * Sentence-Level Context Compressor (Token Optimization & Noise Removal)
 * Extracts high-density matching sentences and strips boilerplate headers/footers.
 */
export function compressContext(
  results: RetrievalResult[],
  query: string
): RetrievalResult[] {
  if (results.length === 0) return results;

  const queryTerms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  return results.map((r) => {
    // Split content into clean sentences or lines
    const sentences = r.content
      .split(/(?<=[.!?\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    // Filter out obvious header/footer boilerplate noise
    const cleanSentences = sentences.filter((s) => {
      const lower = s.toLowerCase();
      if (lower.startsWith('bab ') && lower.length < 40) return false;
      if (lower.startsWith('lampiran ') && lower.length < 50) return false;
      if (lower.startsWith('halaman ') && lower.length < 30) return false;
      if (lower.includes('daftar isi') || lower.includes('daftar gambar')) return false;
      return true;
    });

    if (cleanSentences.length === 0) return r;

    // Rank sentences by term density
    const scoredSentences = cleanSentences.map((s) => {
      const lower = s.toLowerCase();
      let matches = 0;
      for (const term of queryTerms) {
        if (lower.includes(term)) matches++;
      }
      return { sentence: s, matches };
    });

    // Pick top matching sentences or first 3 clean sentences
    const topSentences = scoredSentences
      .filter((item) => item.matches > 0)
      .slice(0, 3)
      .map((item) => item.sentence);

    const compressedContent = topSentences.length > 0
      ? topSentences.join(' ')
      : cleanSentences.slice(0, 3).join(' ');

    return {
      ...r,
      content: compressedContent,
    };
  });
}
