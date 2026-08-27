import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { createOfflineProvider } from './offline.js';
import { createOpenAIProvider } from './openai.js';
import type { LLMProvider } from './provider.js';

let cached: LLMProvider | null = null;

export function getProvider(): LLMProvider {
  if (cached) return cached;
  if (env.OPENAI_API_KEY) {
    cached = createOpenAIProvider();
  } else {
    logger.warn('OPENAI_API_KEY is not set — using the offline tutor. Corrections are rule-based.');
    cached = createOfflineProvider();
  }
  return cached;
}

/** Test seam. */
export function setProvider(provider: LLMProvider | null): void {
  cached = provider;
}

export type { LLMProvider } from './provider.js';
