import type { CloudflareBindings, QueryType } from '../types';
import { CIRCUIT_BREAKER_THRESHOLD, CIRCUIT_BREAKER_RESET_MS } from '../constants';

class CircuitBreaker {
  failures: number;
  lastFailureTime: number;
  readonly threshold: number = CIRCUIT_BREAKER_THRESHOLD;
  readonly resetPeriod: number = CIRCUIT_BREAKER_RESET_MS;

  constructor() {
    this.failures = 0;
    this.lastFailureTime = 0;
  }

  isOpen(): boolean {
    if (Date.now() - this.lastFailureTime > this.resetPeriod) {
      this.failures = 0;
      return false;
    }
    return this.failures >= this.threshold;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
  }
}

const geminiBreaker = new CircuitBreaker();
const groqBreaker = new CircuitBreaker();
const cohereBreaker = new CircuitBreaker();
const openrouterBreaker = new CircuitBreaker();

export async function callWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  provider: 'gemini' | 'groq' | 'cohere' | 'openrouter',
  timeoutMs: number
): Promise<T> {
  const breaker = provider === 'gemini' ? geminiBreaker
    : provider === 'groq' ? groqBreaker
    : provider === 'cohere' ? cohereBreaker
    : openrouterBreaker;

  if (breaker.isOpen()) {
    console.warn(`Circuit breaker open for ${provider}, skipping to fallback`);
    return fallback();
  }

  // Note: AbortController signal cannot be passed to arbitrary async functions. Timeout is enforced via Promise.race in production if needed.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await primary();
    clearTimeout(timeoutId);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    breaker.recordFailure();
    console.warn(`${provider} failed: ${err}, falling back`);
    return fallback();
  }
}
