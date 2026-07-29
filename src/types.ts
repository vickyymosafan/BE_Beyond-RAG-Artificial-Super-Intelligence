
export interface CloudflareBindings {
  DATABASE_URL: string;
  KV_CACHE: KVNamespace;
  R2_IMAGES?: R2Bucket;
  RATE_LIMITER: DurableObjectNamespace;
  PROVIDER_RATE_LIMITER: DurableObjectNamespace;
  ENVIRONMENT: string;
  GEMINI_API_KEY?: string;
  GEMINI_API_KEY_2?: string;
  GEMINI_API_KEY_3?: string;
  GEMINI_API_KEYS?: string;
  GROQ_API_KEY?: string;
  GROQ_API_KEYS?: string;
  COHERE_API_KEY?: string;
  COHERE_API_KEYS?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_API_KEYS?: string;
  JWT_SECRET?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  AI?: any;
}

export type QueryType = 'text' | 'image' | 'table' | 'complex' | 'hybrid';

export interface ChatMessageContext {
  role: 'user' | 'assistant';
  content: string;
}

export interface QueryRequest {
  query: string;
  userId: string;
  documentIds?: string[];
  history?: ChatMessageContext[];
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
  confidence: number;
  asiScore: number;
  reasoningPath: string[];
  sources: Source[];
}

export interface Citation {
  docName: string;
  page: number;
  text: string;
}

export interface Source {
  docId: string;
  page: number;
  chunkId: string;
}

export interface RetrievalResult {
  chunkId: string;
  docId: string;
  content: string;
  contentType: string;
  pageNumber: number;
  sectionTitle: string;
  score: number;
  source: 'vector' | 'bm25' | 'fusion' | 'rerank';
}

export interface CacheEntry {
  query: string;
  queryEmbedding: number[];
  response: string;
  citations: Citation[];
  score: number;
  asiScore: number;
  reasoningPath: string[];
  sources: Source[];
  timestamp: number;
  hitCount: number;
}

export interface CriticResult {
  score: number;
  issues: string[];
  verdict: 'pass' | 'retry' | 'abstain';
}

export interface CorrectiveAction {
  strategy: 'rewrite' | 'hybrid' | 'bm25_only' | 'decompose';
  adjusted_query: string;
}

export interface RewriterOutput {
  rewritten: string;
  variants: string[];
}

export interface FeedbackEntry {
  query: string;
  userId: string;
  rating: 'up' | 'down';
  timestamp: number;
  resolved?: boolean;
}

// Self-Improvement Agent types
export interface LearningLogEntry {
  id?: number;
  query: string;
  originalAnswer: string;
  improvedAnswer?: string;
  gapScore: number;
  gapsFound: string[];
  missingKeywords: string[];
  wasImproved: boolean;
  improvementReason?: string;
  providerUsed?: string;
  originalScore: number;
  improvedScore?: number;
  createdAt?: string;
}

export interface GapAnalysisResult {
  gapScore: number;
  missingKeywords: string[];
  gapsFound: string[];
  shouldImprove: boolean;
}

export interface SelfImproverContext {
  query: string;
  finalAnswer: string;
  groundingScore: number;
  citations: Citation[];
}
