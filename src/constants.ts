// API URLs
export const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
export const GEMINI_EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
export const GEMINI_BATCH_EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents';
export const COHERE_API_URL = 'https://api.cohere.ai/v1/chat';
export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const WORKERS_AI_URL = 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/baai/bge-base-en-v1.5';

// Model names
export const GROQ_MODEL = 'llama-3.1-8b-instant';
export const GROQ_MODEL_VERSATILE = 'llama-3.3-70b-versatile';
export const COHERE_MODEL = 'command-a-03-2025';
export const OPENROUTER_MODEL = 'google/gemma-2-27b-it';
export const GEMINI_EMBEDDING_MODEL = 'models/gemini-embedding-001';

// LLM Config
export const LLM_TEMPERATURE_LOW = 0.2;
export const LLM_TEMPERATURE_MED = 0.3;
export const LLM_MAX_TOKENS_SMALL = 100;
export const LLM_MAX_TOKENS_MED = 300;
export const LLM_MAX_TOKENS_DEFAULT = 500;
export const LLM_MAX_TOKENS_LARGE = 4096;
export const LLM_TOP_P = 0.8;

// Timeouts (ms)
export const TIMEOUT_FAST = 5000;
export const TIMEOUT_GROQ = 10000;
export const TIMEOUT_GEMINI = 15000;
export const TIMEOUT_COHERE = 20000;
export const TIMEOUT_OPENROUTER = 25000;

// Cache TTLs (seconds)
export const CACHE_TTL_EXACT = 86400; // 1 day
export const CACHE_TTL_SEMANTIC = 604800; // 7 days
export const CACHE_TTL_MAX = 604800; // 7 days
export const CACHE_TTL_STATS = 86400 * 30; // 30 days
export const CACHE_TTL_NEGATIVE = 86400 * 7; // 7 days
export const CACHE_TTL_RPD_DAILY = 86400 * 2; // 2 days
export const CACHE_TTL_RPD_MONTHLY = 86400 * 32; // 32 days
export const CACHE_TTL_FEEDBACK = 86400 * 90; // 90 days
export const CACHE_TTL_POPULAR = 86400 * 30; // 30 days

// Thresholds
export const SEMANTIC_THRESHOLD = 0.75;
export const THRESHOLD_ANSWER = 0.82;
export const THRESHOLD_ABSTAIN = 0.01;
export const GROUNDING_THRESHOLD = 0.1;
export const GROUNDING_REGEN_THRESHOLD = 0.8;
export const CRITIC_PASS_THRESHOLD = 0.7;
export const CRITIC_FALLBACK_SCORE = 0.5;
export const MIN_CONFIDENCE_SCORE = 0.55;

// Pipeline
export const TOP_K_RESULTS = 10;
export const TOP_K_PRUNED = 3;
export const MAX_HOPS = 2;
export const MAX_CORRECTIVE_RETRIES = 2;
export const MAX_SUB_QUESTIONS = 4;
export const REWRITER_MAX_WORDS_FAST_PATH = 6;
export const HISTORY_CONTEXT_DEPTH = 4;
export const EMBEDDING_DIMENSION = 768;
export const EMBEDDING_BATCH_SIZE = 25;

// Rate Limits
export const RATE_LIMIT_USER_RPM = 20;
export const RATE_LIMIT_WINDOW_MS = 60000;
export const PROVIDER_RPM_LIMITS: Record<string, number> = { gemini: 15, groq: 30, cohere: 20 };
export const PROVIDER_RPD_LIMITS: Record<string, { daily: number; monthly?: number }> = {
  gemini: { daily: 1500 },
  groq: { daily: 14400 },
  cohere: { daily: 33, monthly: 1000 },
};
export const RPD_WARNING_RATIO = 0.1;

// Circuit Breaker
export const CIRCUIT_BREAKER_THRESHOLD = 5;
export const CIRCUIT_BREAKER_RESET_MS = 60000;

// Error Messages
export const ERROR_PREFIX = 'Maaf';
export const ERROR_QUOTA_PRIMARY = 'Maaf, kuota API harian untuk layanan primary telah habis. Silakan coba lagi besok.';
export const ERROR_QUOTA_PREPROCESSING = 'Maaf, kuota preprocessing harian telah habis. Silakan coba lagi besok.';
export const ERROR_NOT_FOUND = 'Maaf, informasi yang Anda tanyakan tidak ditemukan dalam dokumen yang tersedia.';
export const ERROR_ABSTAIN = 'Maaf, saya tidak dapat memberikan jawaban yang akurat berdasarkan dokumen yang tersedia. Silakan periksa ulang pertanyaan Anda atau konsultasi dengan staff akademik.';
export const ERROR_ALL_PROVIDERS_FAILED = '[Maaf, semua layanan tidak tersedia]';
export const ERROR_GENERATE_FAILED = 'Maaf, terjadi kesalahan saat menghasilkan jawaban.';
export const ERROR_SYSTEM = 'Maaf, terjadi kesalahan pada sistem. Silakan coba beberapa saat lagi.';
export const ERROR_RATE_LIMIT = 'Maksimal 20 request per menit. Silakan tunggu.';
